#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = "tests/integration";
const aliases = new Map([
  ["auth-boundary", "tests/integration/auth-boundary.test.ts"],
  ["health-handshake", "tests/integration/health-handshake.test.ts"],
  ["observability", "tests/integration/observability.test.ts"],
]);

function allIntegrationTests() {
  try {
    return readdirSync(TEST_DIR)
      .map((entry) => join(TEST_DIR, entry))
      .filter((path) => path.endsWith(".test.ts") && statSync(path).isFile())
      .sort();
  } catch {
    return [];
  }
}

const requested = process.argv.slice(2).filter((arg) => arg !== "--");
const selected = requested.length === 0
  ? allIntegrationTests()
  : requested.map((name) => aliases.get(name) ?? name);

if (selected.length === 0) {
  console.error(`No integration tests found under ${TEST_DIR}.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...selected], { stdio: "inherit" });
process.exit(typeof result.status === "number" ? result.status : 1);
