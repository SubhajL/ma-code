#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = "tests/web";
const aliases = new Map([
  ["components", "tests/web/components.test.tsx"],
  ["design-tokens", "tests/web/design-tokens.test.ts"],
]);

function allWebTests() {
  try {
    return readdirSync(TEST_DIR)
      .map((entry) => join(TEST_DIR, entry))
      .filter((path) => /\.test\.(ts|tsx)$/.test(path) && statSync(path).isFile())
      .sort();
  } catch {
    return [];
  }
}

const requested = process.argv.slice(2).filter((arg) => arg !== "--");
const selected = requested.length === 0
  ? allWebTests()
  : requested.map((name) => aliases.get(name) ?? name);

if (selected.length === 0) {
  console.error(`No web tests found under ${TEST_DIR}.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...selected], { stdio: "inherit" });
process.exit(typeof result.status === "number" ? result.status : 1);
