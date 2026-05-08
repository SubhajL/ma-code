import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

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
