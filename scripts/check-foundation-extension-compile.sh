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
cp "$REPO_ROOT/.pi/agent/extensions/domain-governance.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/handoffs.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/recovery-policy.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/recovery-runtime.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/queue-runner.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/graphify-adapter.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/discovery-policy.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/graphify-validation-decision.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/graphify-orchestration-decision.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/graphify-orchestrator.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/execution-leases.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/product-slice-lifecycle.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/stitch-prompt-generator.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/stitch-artifact-adapter.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/live-stitch-adapter.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/screen-artifact-approval.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/slice-contracts.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/frontend-packet-generator.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/backend-packet-generator.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/slice-dependency-decision.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/product-pipeline.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/parallel-worker-lanes.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/issue-materialization.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/afk-orchestration.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/orchestrator-context.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/orchestrator-classifier.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/orchestrator-dry-run.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/orchestrator-apply-policy.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/orchestrator-run.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/orchestrator-evidence.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/git-dirty-runtime-artifacts.ts" "$WORKDIR/src/"
cp "$REPO_ROOT/.pi/agent/extensions/tool-result-envelope.ts" "$WORKDIR/src/"

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
  npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/safe-bash.ts src/till-done.ts src/harness-routing.ts src/team-activation.ts src/domain-governance.ts src/task-packets.ts src/handoffs.ts src/recovery-policy.ts src/recovery-runtime.ts src/queue-runner.ts src/graphify-adapter.ts src/discovery-policy.ts src/graphify-validation-decision.ts src/graphify-orchestration-decision.ts src/graphify-orchestrator.ts src/execution-leases.ts src/product-slice-lifecycle.ts src/stitch-prompt-generator.ts src/stitch-artifact-adapter.ts src/live-stitch-adapter.ts src/screen-artifact-approval.ts src/slice-contracts.ts src/frontend-packet-generator.ts src/backend-packet-generator.ts src/slice-dependency-decision.ts src/product-pipeline.ts src/parallel-worker-lanes.ts src/issue-materialization.ts src/afk-orchestration.ts src/orchestrator-context.ts src/orchestrator-classifier.ts src/orchestrator-dry-run.ts src/orchestrator-apply-policy.ts src/orchestrator-run.ts src/orchestrator-evidence.ts src/git-dirty-runtime-artifacts.ts src/tool-result-envelope.ts
)

echo "foundation-extension-compile-ok"
