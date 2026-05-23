import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_HARNESS_DISPATCH,
  HARNESS_IN_PROCESS_SUBCOMMANDS,
} from "../../scripts/lib/harness-dispatch.ts";

test("DEFAULT_HARNESS_DISPATCH registers all operator subcommands", () => {
  const expected = [
    "status",
    "leases",
    "queue-session",
    "worktree",
    "worker-session",
    "product-pipeline",
    "parallel-worker-lanes",
    "issue-materialize",
    "afk-orchestrate",
    "worker-execute",
    "pr-lifecycle",
    "orchestrate",
  ];

  for (const subcommand of expected) {
    assert.ok(
      DEFAULT_HARNESS_DISPATCH[subcommand],
      `expected dispatch entry for ${subcommand}`,
    );
  }
});

test("HARNESS_IN_PROCESS_SUBCOMMANDS lists subcommands wired to in-process loaders", () => {
  // Anchors the migrated-vs-spawned split so accidental regressions to spawn-mode are visible in tests.
  assert.deepEqual(
    [...HARNESS_IN_PROCESS_SUBCOMMANDS],
    ["status", "leases", "queue-session", "worktree", "worker-session", "product-pipeline"],
  );
});

test("in-process dispatch loads the runner without spawning a child process", async () => {
  const loader = DEFAULT_HARNESS_DISPATCH["status"];
  assert.ok(loader, "status entry must exist");

  const runner = await loader();
  assert.equal(typeof runner, "function");

  const code = await runner(["--help"]);
  assert.equal(code, 0);
});

test("in-process dispatch surfaces non-zero exit codes from runner failure", async () => {
  const loader = DEFAULT_HARNESS_DISPATCH["status"];
  const runner = await loader();

  const code = await runner(["--unknown-flag"]);
  assert.equal(code, 1);
});
