import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const GLOBAL_PI_PACKAGE = "/opt/homebrew/Cellar/pi-coding-agent/0.70.5/libexec/lib/node_modules/@mariozechner/pi-coding-agent";
const EXTENSION_UNDER_TEST = path.resolve(".pi/agent/extensions/new-session-persistence.ts");

function fakeSession(overrides = {}) {
  const extensionRunner = { hasHandlers: () => false };
  const sessionManager = {
    getSessionDir: () => path.join(os.tmpdir(), "pi-new-session-persistence-test-sessions"),
  };
  return {
    extensionRunner,
    sessionFile: overrides.sessionFile ?? path.join(os.tmpdir(), "pi-new-session-persistence-current.jsonl"),
    sessionManager,
    model: overrides.model,
    thinkingLevel: overrides.thinkingLevel ?? "off",
    scopedModels: overrides.scopedModels ?? [],
    setModel: overrides.setModel ?? (async () => true),
    setThinkingLevel: overrides.setThinkingLevel ?? (() => {}),
    setScopedModels: overrides.setScopedModels ?? (() => {}),
    dispose() {},
    createReplacedSessionContext() {
      return {};
    },
  };
}

async function importExtensionWithPiPackageResolution() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-new-session-persistence-extension-"));
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ type: "module" }));
  const scopedPackageDir = path.join(tempDir, "node_modules", "@mariozechner");
  fs.mkdirSync(scopedPackageDir, { recursive: true });
  fs.symlinkSync(GLOBAL_PI_PACKAGE, path.join(scopedPackageDir, "pi-coding-agent"), "dir");
  const tempExtension = path.join(tempDir, "new-session-persistence.ts");
  fs.copyFileSync(EXTENSION_UNDER_TEST, tempExtension);
  await import(`${tempExtension}?cacheBust=${Date.now()}`);
}

test("newSession preserves current model, thinking level, and scoped models for replacement runtime", async (t) => {
  if (!fs.existsSync(GLOBAL_PI_PACKAGE)) {
    t.skip(`Global Pi package not found at ${GLOBAL_PI_PACKAGE}`);
    return;
  }

  const { AgentSessionRuntime } = await import(`${GLOBAL_PI_PACKAGE}/dist/core/agent-session-runtime.js`);
  await importExtensionWithPiPackageResolution();

  const selectedModel = { provider: "provider-a", id: "model-selected", reasoning: true };
  const scopedModel = { provider: "provider-b", id: "model-scoped", reasoning: true };
  const scopedModels = [{ model: scopedModel, thinkingLevel: "medium" }];
  const newSessionCalls = { setModel: [], setThinkingLevel: [], setScopedModels: [] };

  const runtime = new AgentSessionRuntime(
    fakeSession({ model: selectedModel, thinkingLevel: "high", scopedModels }),
    { cwd: os.tmpdir(), agentDir: path.join(os.tmpdir(), "pi-agent") },
    async (options) => ({
      session: fakeSession({
        setModel: async (model) => {
          newSessionCalls.setModel.push(model);
          return true;
        },
        setThinkingLevel: (level) => newSessionCalls.setThinkingLevel.push(level),
        setScopedModels: (nextScopedModels) => newSessionCalls.setScopedModels.push(nextScopedModels),
      }),
      services: { cwd: options.cwd, agentDir: options.agentDir },
      diagnostics: [],
    }),
  );

  const result = await runtime.newSession();

  assert.equal(result.cancelled, false);
  assert.deepEqual(newSessionCalls.setScopedModels, [scopedModels]);
  assert.notEqual(newSessionCalls.setScopedModels[0], scopedModels, "scoped model array should be copied");
  assert.deepEqual(newSessionCalls.setModel, [selectedModel]);
  assert.deepEqual(newSessionCalls.setThinkingLevel, ["high"]);
});
