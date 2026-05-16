#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = "tests/api";
const aliases = new Map([
  ["schema", "tests/api/schema.test.ts"],
  ["migrations", "tests/api/migrations.test.ts"],
  ["contracts", "tests/api/contracts.test.ts"],
  ["seeds", "tests/fixtures/greenfield/seeds.test.ts"],
  ["health", "services/api/src/health.test.ts"],
]);

function allApiTests() {
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
const selected = requested.length === 0 ? allApiTests() : requested.map((name) => aliases.get(name) ?? name);

if (selected.length === 0) {
  console.error(`No API tests found under ${TEST_DIR}.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...selected], { stdio: "inherit" });
process.exit(typeof result.status === "number" ? result.status : 1);
