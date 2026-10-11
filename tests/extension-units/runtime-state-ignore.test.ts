import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// The canonical runtime store (ADR-0001) is a live SQLite database plus its
// WAL/SHM sidecars. Stray nested copies are created when state is resolved
// relative to a subdirectory. None of them may ever be committed.
const runtimeDbPaths = [
  ".pi/agent/state/runtime/pi.db",
  ".pi/agent/state/runtime/pi.db-wal",
  ".pi/agent/state/runtime/pi.db-shm",
  "logs/.pi/agent/state/runtime/pi.db",
];

test("runtime SQLite state files are git-ignored by the repo .gitignore, including nested stray copies", () => {
  for (const path of runtimeDbPaths) {
    // Disable global excludes so only the committed .gitignore can satisfy this check.
    const result = spawnSync(
      "git",
      ["-c", "core.excludesFile=/dev/null", "check-ignore", "--no-index", "--verbose", path],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 0, `expected ${path} to be ignored by .gitignore`);
    assert.match(result.stdout, /^\.gitignore:\d+:/, `expected the repo .gitignore to ignore ${path}`);
  }
});
