#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
from typing import Any

PATH_RE = re.compile(r"(?<![A-Za-z0-9_./-])(?:\.?\.?/)?[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|py|sh|yaml|yml|toml|sql|go|rs|java|kt|swift)")
FALLBACK_PATTERNS = [
    "run out of credits",
    "out of credits",
    "upgrade",
    "sign in",
    "login",
    "authenticate",
    "authentication",
    "unauthorized",
    "forbidden",
    "rate limit",
    "quota",
    "resource exhausted",
    "unavailable",
]


def emit(payload: dict[str, Any]) -> int:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.write("\n")
    sys.stdout.flush()
    return 0


def read_input() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        return {}


def parse_auggie_stdout(stdout: str) -> dict[str, Any] | None:
    for line in reversed([line.strip() for line in stdout.splitlines() if line.strip()]):
        if not line.startswith("{"):
            continue
        try:
            value = json.loads(line)
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            continue
    return None


def summarize_payload(payload: dict[str, Any], stdout: str) -> str:
    for key in ("result", "message", "summary"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return stdout.strip() or "Auggie returned no summary."


def extract_files(text: str, max_results: int) -> list[str]:
    seen: set[str] = set()
    files: list[str] = []
    for match in PATH_RE.findall(text):
        if match in seen:
            continue
        seen.add(match)
        files.append(match)
        if len(files) >= max_results:
            break
    return files


def main() -> int:
    data = read_input()
    question = str(data.get("question", "")).strip()
    max_results = max(1, min(int(data.get("maxResults", 8) or 8), 20))
    auggie_cmd = os.environ.get("AUGGIE_CLI_COMMAND", "auggie")

    if not question:
        return emit(
            {
                "summary": "Auggie discovery bridge requires a non-empty question.",
                "files": [],
                "patterns": [],
                "notes": ["Use local discovery fallback."],
                "fallbackRecommended": True,
            }
        )

    command = [
        auggie_cmd,
        "--print",
        "--ask",
        "--output-format",
        "json",
        "--max-turns",
        "1",
        "--workspace-root",
        os.getcwd(),
        "-i",
        question,
    ]

    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return emit(
            {
                "summary": f"Auggie CLI not found: {auggie_cmd}",
                "files": [],
                "patterns": [],
                "notes": ["Install `auggie` or set AUGGIE_CLI_COMMAND.", "Use local discovery fallback."],
                "fallbackRecommended": True,
            }
        )
    except Exception as exc:  # pragma: no cover - defensive
        return emit(
            {
                "summary": f"Auggie CLI invocation error: {exc}",
                "files": [],
                "patterns": [],
                "notes": ["Use local discovery fallback."],
                "fallbackRecommended": True,
            }
        )

    parsed = parse_auggie_stdout(result.stdout)
    summary = summarize_payload(parsed or {}, result.stdout)
    stderr = (result.stderr or "").strip()
    combined_text = f"{summary}\n{stderr}".lower()
    fallback = result.returncode != 0 or bool(parsed and parsed.get("is_error")) or any(pattern in combined_text for pattern in FALLBACK_PATTERNS)

    notes: list[str] = []
    if stderr:
        notes.append(stderr[:600])
    if fallback:
        notes.append("Use local discovery fallback.")

    return emit(
        {
            "summary": summary,
            "files": extract_files(summary, max_results),
            "patterns": [],
            "notes": notes,
            "fallbackRecommended": fallback,
        }
    )


if __name__ == "__main__":
    raise SystemExit(main())
