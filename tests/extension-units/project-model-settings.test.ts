import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface ProjectSettings {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
  enabledModels?: string[];
}

async function readProjectSettings(): Promise<ProjectSettings> {
  return JSON.parse(await readFile(".pi/settings.json", "utf8")) as ProjectSettings;
}

test("project Pi settings default to codex gpt-5.5 high", async () => {
  const settings = await readProjectSettings();

  assert.equal(settings.defaultProvider, "openai-codex");
  assert.equal(settings.defaultModel, "gpt-5.5");
  assert.equal(settings.defaultThinkingLevel, "high");
});

test("project Pi settings scope /model to anthropic opus and codex gpt-5 choices", async () => {
  const settings = await readProjectSettings();

  assert.deepEqual(settings.enabledModels, [
    "anthropic/claude-opus-4.7",
    "anthropic/claude-opus-4.6",
    "openai-codex/gpt-5.3-codex",
    "openai-codex/gpt-5.3-codex-spark",
    "openai-codex/gpt-5.4",
    "openai-codex/gpt-5.5",
  ]);
  assert.equal(settings.enabledModels?.some((modelId) => modelId.startsWith("github-copilot/")), false);
});
