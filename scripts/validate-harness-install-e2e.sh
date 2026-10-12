#!/usr/bin/env bash
# End-to-end proof that a fresh install gets a working pre-push gate: install this harness into a
# temp repo, run `npm run harness:check` there, enable the hook, and push to a local bare remote twice:
# once green (must pass) and once with a deliberately failing test (must be blocked).
# Reuses this checkout's node_modules (no network). Takes about a minute; not part of `npm run check`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/harness-install-e2e.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
commit() { git -c user.name=e2e -c user.email=e2e@example.invalid commit -qm "$1"; }

git init -q --bare "$WORK/remote.git"
git init -q -b main "$WORK/repo"
(cd "$REPO_ROOT" && node --import tsx scripts/harness-package.ts install --dest "$WORK/repo" --skip-install --skip-validators >/dev/null)
cd "$WORK/repo"
ln -s "$REPO_ROOT/node_modules" node_modules
printf 'node_modules\n' >> .gitignore

npm run --silent harness:check >"$WORK/check.log" 2>&1 || { tail -40 "$WORK/check.log"; echo "install-e2e: FAIL (harness:check in the installed repo)"; exit 1; }
npm run --silent harness:hooks:install >/dev/null
git add -A && commit install && git remote add origin "$WORK/remote.git"
git push -q -u origin main >"$WORK/push1.log" 2>&1 || { tail -40 "$WORK/push1.log"; echo "install-e2e: FAIL (green push was blocked)"; exit 1; }

printf 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("deliberately failing", () => assert.equal(1, 2));\n' \
  > tests/extension-units/zz-install-e2e-fail.test.ts
git add -A && commit "deliberately failing test"
if git push -q origin main >"$WORK/push2.log" 2>&1; then
  echo "install-e2e: FAIL (a push with a failing test went through)"; exit 1
fi
grep -q "pre-push: blocked" "$WORK/push2.log" || { tail -20 "$WORK/push2.log"; echo "install-e2e: FAIL (push failed for another reason)"; exit 1; }
[ "$(git --git-dir="$WORK/remote.git" rev-parse main)" = "$(git rev-parse HEAD~1)" ] || { echo "install-e2e: FAIL (remote moved)"; exit 1; }
echo "install-e2e: PASS (harness:check green in a fresh install; the hook passed a green push and blocked a failing one)"
