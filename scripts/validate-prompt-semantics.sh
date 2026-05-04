#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SEMANTICS_FILE_DEFAULT="$REPO_ROOT/.pi/agent/validation/prompt-semantics.json"
CONTRACT_FILE_DEFAULT="$REPO_ROOT/.pi/agent/validation/prompt-contracts.json"
SEMANTICS_FILE="$SEMANTICS_FILE_DEFAULT"
CONTRACT_FILE="$CONTRACT_FILE_DEFAULT"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --fixtures <path>   Validate a custom prompt-semantics fixtures file
  --contracts <path>  Validate against a custom prompt-contract inventory
  -h, --help          Show this help text
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fixtures)
      SEMANTICS_FILE="$2"
      shift 2
      ;;
    --contracts)
      CONTRACT_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

"${PYTHON_BIN:-python3}" - <<'PY' "$SEMANTICS_FILE" "$CONTRACT_FILE"
import json
import re
import sys
from pathlib import Path

semantics_path = Path(sys.argv[1])
contract_path = Path(sys.argv[2])
semantics = json.loads(semantics_path.read_text(encoding="utf-8"))
contract = json.loads(contract_path.read_text(encoding="utf-8"))

ROLE_PATHS = {
    "orchestrator": ".pi/agent/prompts/roles/orchestrator.md",
    "quality_lead": ".pi/agent/prompts/roles/quality_lead.md",
    "reviewer_worker": ".pi/agent/prompts/roles/reviewer_worker.md",
    "validator_worker": ".pi/agent/prompts/roles/validator_worker.md",
    "recovery_worker": ".pi/agent/prompts/roles/recovery_worker.md",
    "frontend_worker": ".pi/agent/prompts/roles/frontend_worker.md",
    "backend_worker": ".pi/agent/prompts/roles/backend_worker.md",
    "infra_worker": ".pi/agent/prompts/roles/infra_worker.md",
}

ALLOWED = {
    "orchestrator_decision": {"route", "blocked", "retry", "escalate", "complete"},
    "quality_decision": {"send_to_review", "send_to_validation", "reject", "accept", "blocked"},
    "review_verdict": {"changes_required", "no_required_fixes"},
    "validator_decision": {"pass", "fail", "blocked"},
    "proof_status": {"sufficient", "partial", "missing", "contradictory"},
    "missing_proof_category": {"none", "acceptance_gap", "evidence_missing", "validation_missing", "wiring_unchecked", "blocked_dependency", "contradictory_evidence"},
    "decision_basis": {"proof_sufficient", "proof_gap", "blocked_dependency"},
    "recommended_action": {"retry_same_lane", "retry_stronger_model", "switch_provider", "rollback", "stop", "escalate"},
    "worker_status": {"done", "blocked", "escalated"},
}

NARRATION_ONLY_PHRASES = (
    "narration only",
    "narrative only",
    "described the work",
    "described the script work",
    "summarized the code change",
    "claimed completion without",
)


def role_headers(role: str) -> list[str]:
    rel = ROLE_PATHS[role]
    spec = contract["files"][rel]
    return spec["exactTopLevelHeaders"]


def split_sections(text: str):
    headers = []
    sections = {}
    current = None
    buf = []
    for raw in text.splitlines():
        if raw.startswith("## "):
            if current is not None:
                sections[current] = buf[:]
            headers.append(raw)
            current = raw[3:]
            buf = []
        else:
            buf.append(raw)
    if current is not None:
        sections[current] = buf[:]
    return headers, sections


def nonblank(lines: list[str]) -> list[str]:
    return [line.strip() for line in lines if line.strip()]


def section_is_none(lines: list[str]) -> bool:
    data = nonblank(lines)
    return data == ["- none"]


def section_has_content(lines: list[str]) -> bool:
    data = nonblank(lines)
    return bool(data) and data != ["- none"]


def find_line(text: str, prefix: str):
    pattern = re.compile(rf"^(?:-\s*)?{re.escape(prefix)}:\s*(.+)$", re.MULTILINE)
    match = pattern.search(text)
    return match.group(1).strip() if match else None


def parse_structured_items(lines: list[str], required_fields: list[str], error_code: str) -> list[str]:
    errors = []
    entries = [line.strip() for line in nonblank(lines)]
    if entries == ["- none"]:
        return errors
    for line in entries:
        if not line.startswith("- "):
            errors.append(error_code)
            continue
        body = line[2:]
        fields = {}
        for part in body.split("|"):
            if ":" not in part:
                continue
            key, value = part.split(":", 1)
            fields[key.strip()] = value.strip()
        missing = [field for field in required_fields if not fields.get(field)]
        if missing:
            errors.append(error_code)
    return errors


def contains_command_marker(text: str) -> bool:
    return bool(re.search(r"`[^`]+`|\b(?:bash|npm|pnpm|npx|node|pytest|go test|cargo test|git diff --check)\b", text, re.IGNORECASE))


def contains_failure_marker(text: str) -> bool:
    return bool(re.search(r"\b(?:red|fail|failed|error)\b", text, re.IGNORECASE))


def contains_success_marker(text: str) -> bool:
    return bool(re.search(r"\b(?:green|pass|passed|succeeded|success)\b", text, re.IGNORECASE))


def validate_build_worker(role: str, text: str, proof_section: str):
    errors, sections = validate_common(role, text)
    status = find_line(text, "Status")
    if status not in ALLOWED["worker_status"]:
        errors.append(f"{role}.invalid_status")
        return errors
    if status != "done":
        return errors

    proof_lines = sections.get(proof_section, [])
    proof_key = proof_section.lower().replace(" ", "_")
    if not section_has_content(proof_lines):
        errors.append(f"{role}.done_without_{proof_key}")
        return errors

    proof_text = "\n".join(nonblank(proof_lines)).lower()
    if any(phrase in proof_text for phrase in NARRATION_ONLY_PHRASES):
        errors.append(f"{role}.narration_only_{proof_key}")
    if not contains_command_marker(proof_text):
        errors.append(f"{role}.missing_command_{proof_key}")
    if not contains_failure_marker(proof_text):
        errors.append(f"{role}.missing_failure_{proof_key}")
    if not contains_success_marker(proof_text):
        errors.append(f"{role}.missing_success_{proof_key}")
    return errors


def validate_common(role: str, text: str):
    errors = []
    headers, sections = split_sections(text)
    expected = role_headers(role)
    if headers != expected:
        errors.append(f"{role}.headers")
    for header in expected:
        section_name = header[3:]
        if section_name not in sections:
            errors.append(f"{role}.missing_section.{section_name.lower().replace(' ', '_')}")
    return errors, sections


def validate_orchestrator(text: str):
    errors, sections = validate_common("orchestrator", text)
    decision = find_line(text, "Decision")
    if decision not in ALLOWED["orchestrator_decision"]:
        errors.append("orchestrator.invalid_decision")
    for name in ("Goal", "Team Routing", "Completion Decision", "Next Action"):
        if name in sections and not section_has_content(sections[name]):
            errors.append(f"orchestrator.empty_{name.lower().replace(' ', '_')}")
    return errors


def validate_quality_lead(text: str):
    errors, sections = validate_common("quality_lead", text)
    decision = find_line(text, "Decision")
    if decision not in ALLOWED["quality_decision"]:
        errors.append("quality_lead.invalid_decision")
    if "Review Scope" in sections and not section_has_content(sections["Review Scope"]):
        errors.append("quality_lead.empty_review_scope")
    if "Validation Scope" in sections and not section_has_content(sections["Validation Scope"]):
        errors.append("quality_lead.empty_validation_scope")
    if "Decision" in sections and not section_has_content(sections["Decision"]):
        errors.append("quality_lead.empty_decision_section")
    if "Next Action" in sections and not section_has_content(sections["Next Action"]):
        errors.append("quality_lead.empty_next_action")
    return errors


def validate_reviewer_worker(text: str):
    errors, sections = validate_common("reviewer_worker", text)
    verdict = find_line(text, "Review Verdict")
    if verdict not in ALLOWED["review_verdict"]:
        errors.append("reviewer_worker.invalid_review_verdict")
    severity_summary = find_line(text, "Severity Summary")
    if not severity_summary or not re.fullmatch(r"CRITICAL=\d+ HIGH=\d+ MEDIUM=\d+ LOW=\d+", severity_summary):
        errors.append("reviewer_worker.invalid_severity_summary")
    if "Findings by Severity" in sections and not section_has_content(sections["Findings by Severity"]):
        errors.append("reviewer_worker.empty_findings")
    required_fixes = sections.get("Required Fixes", [])
    if verdict == "changes_required" and not section_has_content(required_fixes):
        errors.append("reviewer_worker.required_fixes_missing")
    errors.extend(parse_structured_items(required_fixes, ["severity", "summary", "file_ref", "fix_direction", "validation_needed"], "reviewer_worker.bad_required_fix_item"))
    optional_improvements = sections.get("Optional Improvements", [])
    errors.extend(parse_structured_items(optional_improvements, ["summary", "file_ref", "benefit", "follow_up"], "reviewer_worker.bad_optional_improvement_item"))
    return errors


def validate_validator_worker(text: str):
    errors, sections = validate_common("validator_worker", text)
    final_decision = find_line(text, "Final Decision")
    if final_decision not in ALLOWED["validator_decision"]:
        errors.append("validator_worker.invalid_final_decision")
    proof_status = find_line(text, "Proof Status")
    if proof_status not in ALLOWED["proof_status"]:
        errors.append("validator_worker.invalid_proof_status")
    missing_category = find_line(text, "Missing Proof Category")
    if missing_category not in ALLOWED["missing_proof_category"]:
        errors.append("validator_worker.invalid_missing_proof_category")
    decision_basis = find_line(text, "Decision Basis")
    if decision_basis not in ALLOWED["decision_basis"]:
        errors.append("validator_worker.invalid_decision_basis")
    missing_proof = sections.get("Missing Proof", [])
    errors.extend(parse_structured_items(missing_proof, ["category", "gap", "evidence_needed", "blocking_effect"], "validator_worker.bad_missing_proof_item"))
    if final_decision == "pass":
        if missing_category != "none" or section_has_content(missing_proof):
            errors.append("validator_worker.pass_with_missing_proof")
    else:
        if missing_category == "none":
            errors.append("validator_worker.nonpass_without_missing_proof_category")
    return errors


def validate_recovery_worker(text: str):
    errors, sections = validate_common("recovery_worker", text)
    action = find_line(text, "Recommended Action")
    if action not in ALLOWED["recommended_action"]:
        errors.append("recovery_worker.invalid_recommended_action")
    for name in ("Failure Summary", "Likely Causes", "Recovery Options"):
        if name in sections and not section_has_content(sections[name]):
            errors.append(f"recovery_worker.empty_{name.lower().replace(' ', '_')}")
    if action == "escalate":
        options_text = "\n".join(sections.get("Recovery Options", []))
        if "migration" not in options_text.lower():
            errors.append("recovery_worker.escalate_without_migration_path")
    return errors


def validate_frontend_worker(text: str):
    return validate_build_worker("frontend_worker", text, "Evidence")


def validate_backend_worker(text: str):
    return validate_build_worker("backend_worker", text, "Evidence")


def validate_infra_worker(text: str):
    return validate_build_worker("infra_worker", text, "Validation")


VALIDATORS = {
    "orchestrator": validate_orchestrator,
    "quality_lead": validate_quality_lead,
    "reviewer_worker": validate_reviewer_worker,
    "validator_worker": validate_validator_worker,
    "recovery_worker": validate_recovery_worker,
    "frontend_worker": validate_frontend_worker,
    "backend_worker": validate_backend_worker,
    "infra_worker": validate_infra_worker,
}

failures: list[str] = []
fixtures = semantics.get("fixtures", [])
if not isinstance(fixtures, list) or not fixtures:
    failures.append("fixtures :: prompt-semantics.json must define a non-empty fixtures array")
else:
    for fixture in fixtures:
        if not isinstance(fixture, dict):
            failures.append("fixtures :: every fixture entry must be an object")
            continue
        fixture_id = fixture.get("id", "<missing-id>")
        role = fixture.get("role")
        expect = fixture.get("expect")
        text = fixture.get("content", "")
        expected_errors = fixture.get("expectedErrors", [])
        if role not in VALIDATORS:
            failures.append(f"{fixture_id} :: unsupported role {role}")
            continue
        if expect not in {"pass", "fail"}:
            failures.append(f"{fixture_id} :: expect must be pass or fail")
            continue
        errors = sorted(set(VALIDATORS[role](text)))
        if expect == "pass":
            if errors:
                failures.append(f"{fixture_id} :: expected pass but got errors {errors}")
        else:
            if not errors:
                failures.append(f"{fixture_id} :: expected failure but got pass")
            else:
                missing_expected = [code for code in expected_errors if code not in errors]
                if missing_expected:
                    failures.append(f"{fixture_id} :: missing expected errors {missing_expected}; actual={errors}")

if failures:
    print("prompt-semantics-validation: FAIL", file=sys.stderr)
    for failure in failures:
        print(f"- {failure}", file=sys.stderr)
    raise SystemExit(1)

print(f"prompt-semantics-validation: PASS ({len(fixtures)} fixtures checked)")
PY
