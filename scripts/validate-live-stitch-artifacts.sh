#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TSX_IMPORT="${TSX_IMPORT_PATH:-tsx}"

echo "live-stitch-artifact-validator: unit tests"
node --import "$TSX_IMPORT" --test "$REPO_ROOT/tests/extension-units/live-stitch-adapter.test.ts"

echo "live-stitch-artifact-validator: integration tests"
TSX_IMPORT_PATH="$TSX_IMPORT" node --import "$TSX_IMPORT" --test "$REPO_ROOT/tests/integration/live-stitch-artifact.test.ts"

echo "live-stitch-artifact-validator: compile helper and CLI"
npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
  "$REPO_ROOT/.pi/agent/extensions/stitch.ts" \
  "$REPO_ROOT/scripts/harness-live-stitch-artifact.ts"

echo "live-stitch-artifact-validator: static docs and wiring"
node - "$REPO_ROOT" <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
const pkg = JSON.parse(read('package.json'));
const template = JSON.parse(read('.pi/agent/package/templates/package.template.json'));
const schema = JSON.parse(read('.pi/agent/state/schemas/live-stitch-artifact.schema.json'));
const adapter = read('.pi/agent/extensions/live-stitch-adapter.ts');
const cli = read('scripts/harness-live-stitch-artifact.ts');
const docs = read('.pi/agent/docs/live_stitch_adapter.md');
const stitchDocs = read('.pi/agent/docs/stitch_artifacts.md');
const approvalDocs = read('.pi/agent/docs/screen_artifact_approval.md');
for (const key of ['harness:live-stitch-artifact','test:live-stitch-artifact','validate:live-stitch-artifact']) {
  if (!pkg.scripts[key]) throw new Error(`missing package script ${key}`);
}
if (!template.scripts['harness:live-stitch-artifact']) throw new Error('missing package template live Stitch script');
if (schema.properties.mode.const !== 'live') throw new Error('live schema mode must be live');
if (schema.properties.constraints.properties.requiresHumanApproval.const !== true) throw new Error('live schema must require human approval');
for (const needle of ['STITCH_API_KEY', 'requiresHumanApproval: true', 'queueJobsCreated: false', 'taskPacketsCreated: false', 'Forbidden live Stitch provider argument']) {
  if (!adapter.includes(needle)) throw new Error(`adapter missing ${needle}`);
}
for (const forbidden of ['task_update', 'run_next_queue_job', 'worker-session']) {
  if (adapter.includes(forbidden) || cli.includes(forbidden)) throw new Error(`live adapter/CLI must not dispatch runtime workers: ${forbidden}`);
}
for (const needle of ['mock mode remains default', 'live output still requires human approval', 'does not create task packets', 'does not create queue jobs', 'does not dispatch workers', 'does not run as a daemon']) {
  if (!docs.includes(needle)) throw new Error(`live docs missing ${needle}`);
}
if (!stitchDocs.includes('harness:live-stitch-artifact')) throw new Error('stitch docs must link live adapter');
if (!approvalDocs.includes('mode: `mock` or `live`')) throw new Error('approval docs must distinguish artifact mode');
NODE
