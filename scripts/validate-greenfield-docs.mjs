#!/usr/bin/env node
import { accessSync, constants, readFileSync } from "node:fs";

const requiredFiles = [
  "README.md",
  "docs/initiatives/greenfield-scaffold/README.md",
  "docs/initiatives/greenfield-scaffold/backout.md",
  "docs/initiatives/greenfield-scaffold/phase-b-queue-readiness.md",
];

const missing = [];
for (const path of requiredFiles) {
  try {
    accessSync(path, constants.R_OK);
    if (readFileSync(path, "utf8").trim().length === 0) missing.push(`${path} is empty`);
  } catch {
    missing.push(`${path} is missing`);
  }
}

if (missing.length > 0) {
  console.error(missing.join("\n"));
  process.exit(1);
}

console.log("greenfield-docs-ok");
