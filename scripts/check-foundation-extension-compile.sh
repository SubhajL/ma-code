#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

WORKDIR="$TMP_ROOT/compile"
mkdir -p "$WORKDIR/src"
cp "$REPO_ROOT/.pi/agent/extensions/safe-bash.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/till-done.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/harness-routing.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/team-activation.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/task-packets.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/handoffs.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/recovery-policy.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/recovery-runtime.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/queue-runner.ts" "$WORKDIR/src/"

cat > "$WORKDIR/package.json" <<'JSON'
{
  "name": "ma-code-foundation-extension-compile",
  "private": true,
  "type": "module",
  "dependencies": {
    "@mariozechner/pi-coding-agent": "0.67.6",
    "@mariozechner/pi-ai": "0.67.6",
    "@sinclair/typebox": "^0.34.41",
    "typescript": "^5.9.3",
    "@types/node": "^24.5.2"
  }
}
JSON

(
  cd "$WORKDIR"
  npm install --silent >/dev/null 2>&1
  npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/safe-bash.ts src/till-done.ts src/harness-routing.ts src/team-activation.ts src/task-packets.ts src/handoffs.ts src/recovery-policy.ts src/recovery-runtime.ts src/queue-runner.ts
)

echo "foundation-extension-compile-ok"
