#!/usr/bin/env node
/**
 * npx-callable bin shim for `harness:install`.
 *
 * Designed to be invoked from outside this repo via:
 *   - `npx github:SubhajL/ma-code#main pi-harness-install --dest .`
 *   - `npx -p github:SubhajL/ma-code#main pi-harness-install --dest /path/to/repo`
 *
 * Internally just resolves the package install location (via `import.meta.url`)
 * and delegates to `scripts/harness-package.ts install`. Documented in
 * ADR-0010.
 *
 * Why this is a separate `.mjs` shim (not just a package.json `bin` pointing at
 * `harness-package.ts` directly): the bin needs to set `--source-root` to its
 * own package install location, not the user's cwd. The shim computes that
 * once and forwards the rest of the args.
 *
 * Exit codes mirror `harness-package.ts install`:
 *   0 = success
 *   non-zero = bootstrap/install/validator step failed (see stderr above)
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The bin lives at `<package-root>/scripts/bin/pi-harness-install.mjs`, so the
// package root is two `dirname`s up.
const PACKAGE_ROOT = resolve(__dirname, "..", "..");
const HARNESS_PACKAGE_TS = resolve(PACKAGE_ROOT, "scripts", "harness-package.ts");
// Use the package's own tsx bin instead of `node --import tsx`. With
// `--import`, Node resolves "tsx" relative to the user's cwd, which
// fails when the bin runs from outside the package (npx, or pointed at
// an external --dest). Invoking the package-local tsx bin directly
// bypasses that resolution path.
const TSX_BIN = resolve(PACKAGE_ROOT, "node_modules", ".bin", "tsx");

if (!existsSync(HARNESS_PACKAGE_TS)) {
  process.stderr.write(
    `pi-harness-install: cannot locate scripts/harness-package.ts at ${HARNESS_PACKAGE_TS}.\n` +
      `This bin must be invoked from a complete pi-harness package install.\n`,
  );
  process.exit(1);
}
if (!existsSync(TSX_BIN)) {
  process.stderr.write(
    `pi-harness-install: cannot locate package-local tsx at ${TSX_BIN}.\n` +
      `Run \`npm install\` in the pi-harness package directory first.\n`,
  );
  process.exit(1);
}

// Parse forwarded args. If the caller did not pass --dest, default to cwd
// (the typical "I'm in the repo I want to install into" intent for `npx`).
// If the caller did not pass --source-root, force-set it to the bin's own
// package root.
const userArgs = process.argv.slice(2);
const hasDest = userArgs.some((a) => a === "--dest" || a.startsWith("--dest="));
const hasSourceRoot = userArgs.some(
  (a) => a === "--source-root" || a.startsWith("--source-root="),
);

const finalArgs = ["install", ...userArgs];
if (!hasDest) {
  finalArgs.push("--dest", process.cwd());
}
if (!hasSourceRoot) {
  finalArgs.push("--source-root", PACKAGE_ROOT);
}

const result = spawnSync(
  TSX_BIN,
  [HARNESS_PACKAGE_TS, ...finalArgs],
  { stdio: "inherit" },
);

if (result.error) {
  process.stderr.write(
    `pi-harness-install: failed to spawn tsx: ${result.error.message}\n`,
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
