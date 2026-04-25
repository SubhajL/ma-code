#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACT_FILE="$REPO_ROOT/.pi/agent/validation/prompt-contracts.json"

"${PYTHON_BIN:-python3}" - <<'PY' "$REPO_ROOT" "$CONTRACT_FILE"
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
contract_path = Path(sys.argv[2])
contract = json.loads(contract_path.read_text(encoding="utf-8"))
defaults = contract.get("defaults", {})
files = contract.get("files", {})

failures: list[str] = []


def gather_prompt_files(kind: str) -> list[str]:
    if kind == "role":
        base = root / ".pi/agent/prompts/roles"
    elif kind == "template":
        base = root / ".pi/agent/prompts/templates"
    else:
        raise ValueError(f"unsupported kind: {kind}")
    return sorted(str(path.relative_to(root)) for path in base.glob("*.md"))


for kind in ("role", "template"):
    discovered = gather_prompt_files(kind)
    declared = sorted(path for path, spec in files.items() if spec.get("kind") == kind)
    missing_contracts = sorted(set(discovered) - set(declared))
    orphaned_contracts = sorted(set(declared) - set(discovered))
    for path in missing_contracts:
        failures.append(f"{path} :: prompt file exists without a contract entry")
    for path in orphaned_contracts:
        failures.append(f"{path} :: contract entry exists but the prompt file is missing")


for rel_path, spec in sorted(files.items()):
    path = root / rel_path
    if not path.exists():
        failures.append(f"{rel_path} :: prompt file is missing")
        continue

    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    line_set = set(lines)

    merged_required_substrings = list(defaults.get(spec["kind"], {}).get("requiredSubstrings", []))
    merged_required_substrings.extend(spec.get("requiredSubstrings", []))
    for needle in merged_required_substrings:
        if needle not in text:
            failures.append(f"{rel_path} :: missing required text: {needle}")

    for required_line in spec.get("requiredLines", []):
        if required_line not in line_set:
            failures.append(f"{rel_path} :: missing required line: {required_line}")

    headers: list[str] = []
    in_fence = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if line.startswith("## "):
            headers.append(line)

    expected_headers = spec.get("exactTopLevelHeaders", [])
    if headers != expected_headers:
        failures.append(
            f"{rel_path} :: top-level headers differ. expected={expected_headers} actual={headers}"
        )

if failures:
    print("prompt-contract-validation: FAIL", file=sys.stderr)
    for failure in failures:
        print(f"- {failure}", file=sys.stderr)
    raise SystemExit(1)

print(f"prompt-contract-validation: PASS ({len(files)} prompt files checked)")
PY
