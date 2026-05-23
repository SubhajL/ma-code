import assert from "node:assert/strict";
import test from "node:test";

import {
  HarnessUnknownSubcommandError,
  runHarnessCommand,
  type HarnessDispatchTable,
  type HarnessRunner,
} from "../../scripts/lib/harness-runner.ts";

function makeTable(entries: Record<string, HarnessRunner>): HarnessDispatchTable {
  const table: HarnessDispatchTable = {};
  for (const [name, runner] of Object.entries(entries)) {
    table[name] = async () => runner;
  }
  return table;
}

test("runHarnessCommand invokes the runner with the supplied argv and returns its exit code", async () => {
  const seen: string[][] = [];
  const table = makeTable({
    status: async (argv) => {
      seen.push(argv);
      return 0;
    },
  });

  const code = await runHarnessCommand(table, "status", ["--json", "--cwd", "/tmp"]);

  assert.equal(code, 0);
  assert.deepEqual(seen, [["--json", "--cwd", "/tmp"]]);
});

test("runHarnessCommand propagates the runner's non-zero exit code", async () => {
  const table = makeTable({
    status: async () => 2,
  });

  const code = await runHarnessCommand(table, "status", []);

  assert.equal(code, 2);
});

test("runHarnessCommand throws HarnessUnknownSubcommandError for unknown subcommands", async () => {
  const table = makeTable({ status: async () => 0 });

  await assert.rejects(
    () => runHarnessCommand(table, "missing", []),
    (err) => {
      assert.ok(err instanceof HarnessUnknownSubcommandError);
      assert.equal(err.subcommand, "missing");
      assert.match(err.message, /missing/);
      return true;
    },
  );
});

test("runHarnessCommand lets the runner's thrown errors propagate", async () => {
  const table = makeTable({
    status: async () => {
      throw new Error("boom");
    },
  });

  await assert.rejects(() => runHarnessCommand(table, "status", []), /boom/);
});

test("runHarnessCommand awaits the lazy loader before invoking the runner", async () => {
  let loaderCalls = 0;
  const table: HarnessDispatchTable = {
    status: async () => {
      loaderCalls += 1;
      return async () => 0;
    },
  };

  await runHarnessCommand(table, "status", []);
  await runHarnessCommand(table, "status", []);

  assert.equal(loaderCalls, 2, "loader is called per dispatch so callers can manage their own caching");
});

test("HarnessUnknownSubcommandError lists known subcommands in the message", () => {
  const err = new HarnessUnknownSubcommandError("missing", ["status", "leases"]);
  assert.match(err.message, /missing/);
  assert.match(err.message, /status/);
  assert.match(err.message, /leases/);
});
