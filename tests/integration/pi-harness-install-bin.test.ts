import assert from "node:assert/strict";
import test from "node:test";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const binPath = join(repoRoot, "scripts", "bin", "pi-harness-install.mjs");

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

test("pi-harness-install bin shim copies reusable harness assets into --dest", async () => {
  const dest = await mkdtemp(join(tmpdir(), "pi-harness-bin-dest-"));
  await execFile(process.execPath, [binPath, "--dest", dest, "--skip-install", "--skip-validators", "--json"], {
    cwd: tmpdir(), // run from outside the repo so cwd-based defaults can't accidentally satisfy the test
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  });

  // Root-level governance files
  assert.ok(await exists(join(dest, "AGENTS.md")), "AGENTS.md should land at dest root");
  assert.ok(await exists(join(dest, "SYSTEM.md")), "SYSTEM.md should land at dest root");
  assert.ok(await exists(join(dest, "package.json")), "package.json should land at dest root");

  // Harness internals
  assert.ok(
    await exists(join(dest, ".pi", "agent", "extensions")),
    "harness extensions should land under .pi/agent/extensions",
  );
  assert.ok(
    await exists(join(dest, ".pi", "agent", "docs")),
    "harness docs should land under .pi/agent/docs",
  );

  // package.json template should carry the harness:* script aliases
  // (any one is sufficient — the template's exact list is owned by
  // .pi/agent/package/templates/package.template.json and may evolve)
  const destPackageJson = JSON.parse(await readFile(join(dest, "package.json"), "utf8"));
  assert.ok(
    typeof destPackageJson.scripts?.["harness:status"] === "string",
    "dest package.json must carry the harness:status script alias from the template",
  );
});

test("pi-harness-install bin shim defaults --dest to process.cwd() when not provided", async () => {
  const dest = await mkdtemp(join(tmpdir(), "pi-harness-bin-cwd-"));
  // Run from inside `dest` with NO --dest flag; the bin should treat cwd as dest.
  await execFile(process.execPath, [binPath, "--skip-install", "--skip-validators", "--json"], {
    cwd: dest,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  });
  assert.ok(await exists(join(dest, "AGENTS.md")), "cwd-default should install into the current directory");
});

test("pi-harness-install bin shim rejects when scripts/harness-package.ts is missing", async () => {
  // We can't easily fake a missing harness-package.ts in this repo's checkout,
  // so just verify the bin includes the existence-check error message —
  // this guards against the check being silently removed.
  const { readFile: rf } = await import("node:fs/promises");
  const source = await rf(binPath, "utf8");
  assert.match(source, /cannot locate scripts\/harness-package\.ts/);
  assert.match(source, /must be invoked from a complete pi-harness package install/);
});
