import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import { DuplicateDetectingPi } from "./test-utils.ts";

test("all top-level extension modules export a default factory function", async () => {
  const extensionsDir = new URL("../../.pi/agent/extensions/", import.meta.url);
  const entries = (await readdir(extensionsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .sort();

  const missingFactoryExports: string[] = [];
  for (const entry of entries) {
    const mod = await import(new URL(entry, extensionsDir).href);
    if (typeof mod.default !== "function") missingFactoryExports.push(entry);
  }

  assert.deepEqual(
    missingFactoryExports,
    [],
    `Expected every auto-loaded extension module to export a default factory function. Missing: ${missingFactoryExports.join(", ")}`,
  );
});

test("auto-loading every top-level extension registers recovery tools exactly once", async () => {
  const extensionsDir = new URL("../../.pi/agent/extensions/", import.meta.url);
  const entries = (await readdir(extensionsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .sort();
  const recoveryToolNames = new Set(["resolve_recovery_policy", "resolve_recovery_runtime_decision"]);
  const pi = new DuplicateDetectingPi("task/extension-auto-load", recoveryToolNames);

  for (const entry of entries) {
    const mod = await import(new URL(entry, extensionsDir).href);
    await mod.default(pi as any);
  }

  assert.equal(pi.getToolRegistrationCount("resolve_recovery_policy"), 1);
  assert.equal(pi.getToolRegistrationCount("resolve_recovery_runtime_decision"), 1);
});
