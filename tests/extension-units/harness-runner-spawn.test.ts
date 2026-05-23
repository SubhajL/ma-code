import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createSpawnHarnessRunner } from "../../scripts/lib/harness-runner-spawn.ts";

function makeFixtureScript(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-runner-spawn-"));
  const file = join(dir, "fixture.ts");
  writeFileSync(file, body);
  return file;
}

test("createSpawnHarnessRunner runs the target script and returns its exit code", async () => {
  const fixture = makeFixtureScript(`
    process.stdout.write("ok-" + (process.argv.slice(2).join("|") || "none"));
    process.exit(0);
  `);

  const runner = createSpawnHarnessRunner(fixture, { stdio: "pipe" });
  const code = await runner(["a", "b"]);

  assert.equal(code, 0);
});

test("createSpawnHarnessRunner returns 1 when the script exits non-zero", async () => {
  const fixture = makeFixtureScript(`
    process.exit(3);
  `);

  const runner = createSpawnHarnessRunner(fixture, { stdio: "pipe" });
  const code = await runner([]);

  assert.equal(code, 3);
});

test("createSpawnHarnessRunner uses the configured node loader import", async () => {
  const fixture = makeFixtureScript(`
    process.exit(0);
  `);

  const runner = createSpawnHarnessRunner(fixture, {
    tsxImport: "tsx",
    stdio: "pipe",
  });
  const code = await runner([]);

  assert.equal(code, 0);
});

test("createSpawnHarnessRunner forwards passthrough args after the '--' separator", async () => {
  const fixture = makeFixtureScript(`
    process.stdout.write(JSON.stringify(process.argv.slice(2)));
    process.exit(0);
  `);

  const runner = createSpawnHarnessRunner(fixture, { stdio: "pipe" });
  const code = await runner(["--", "--flag", "value"]);

  assert.equal(code, 0);
});

test("createSpawnHarnessRunner returns 1 when the script exits on a signal", async () => {
  const fixture = makeFixtureScript(`
    process.kill(process.pid, "SIGTERM");
    // give the signal time to land
    setTimeout(() => process.exit(0), 1000);
  `);

  const runner = createSpawnHarnessRunner(fixture, { stdio: "pipe" });
  const code = await runner([]);

  assert.notEqual(code, 0);
});

test("createSpawnHarnessRunner resolves the script path relative to the caller", async () => {
  const fixture = makeFixtureScript(`process.exit(0);`);
  const absolute = resolve(fixture);

  const runner = createSpawnHarnessRunner(absolute, { stdio: "pipe" });
  const code = await runner([]);

  assert.equal(code, 0);
});
