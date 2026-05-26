import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  isAnyOpus,
  readStrongReasoningOpusCandidates,
  selectSecondModel,
} from "../../packages/pi-g-skills/extensions/second-model-opus.ts";

function modelLike(provider: string, id: string): { provider: string; id: string } {
  return { provider, id };
}

const OPUS_47 = modelLike("anthropic", "claude-opus-4-7");
const OPUS_46 = modelLike("anthropic", "claude-opus-4-6");
const SONNET_46 = modelLike("anthropic", "claude-sonnet-4-6");
const GPT_55 = modelLike("openai-codex", "gpt-5.5");

async function makeRepoWithCapabilities(model_ids: string[]): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "second-model-opus-test-"));
  await mkdir(join(cwd, ".pi", "agent"), { recursive: true });
  await writeFile(
    join(cwd, ".pi", "agent", "models.json"),
    JSON.stringify({
      capabilities: {
        strong_reasoning: {
          description: "test fixture",
          model_ids,
        },
      },
    }),
  );
  return cwd;
}

test("isAnyOpus matches anthropic Opus 4.x but not Sonnet/GPT", () => {
  assert.equal(isAnyOpus(OPUS_47), true);
  assert.equal(isAnyOpus(OPUS_46), true);
  assert.equal(isAnyOpus(SONNET_46), false);
  assert.equal(isAnyOpus(GPT_55), false);
  assert.equal(isAnyOpus(modelLike("openai-codex", "claude-opus-4-7")), false);
});

test("selectSecondModel prefers capability list order when both Opus versions are available", () => {
  const result = selectSecondModel(
    [OPUS_46, OPUS_47, SONNET_46, GPT_55],
    null,
    ["anthropic/claude-opus-4-7", "anthropic/claude-opus-4-6"],
  );
  assert.deepEqual(result, OPUS_47);
});

test("selectSecondModel falls back to any anthropic Opus when capability list is empty", () => {
  const result = selectSecondModel([SONNET_46, OPUS_46, GPT_55], null, []);
  assert.deepEqual(result, OPUS_46);
});

test("selectSecondModel excludes the current model when picking from capability list", () => {
  const result = selectSecondModel(
    [OPUS_47, OPUS_46, GPT_55],
    "anthropic/claude-opus-4-7",
    ["anthropic/claude-opus-4-7", "anthropic/claude-opus-4-6"],
  );
  assert.deepEqual(result, OPUS_46);
});

test("selectSecondModel excludes the current model when falling back to any Opus", () => {
  const result = selectSecondModel([OPUS_46], "anthropic/claude-opus-4-6", []);
  assert.equal(result, null);
});

test("selectSecondModel returns null when no Anthropic Opus is available", () => {
  const result = selectSecondModel([SONNET_46, GPT_55], null, []);
  assert.equal(result, null);
});

test("readStrongReasoningOpusCandidates filters to anthropic Opus model_ids only", async () => {
  const cwd = await makeRepoWithCapabilities([
    "openai-codex/gpt-5.5",
    "anthropic/claude-opus-4-7",
    "anthropic/claude-sonnet-4-6",
    "anthropic/claude-opus-4-6",
  ]);
  const result = await readStrongReasoningOpusCandidates(cwd);
  assert.deepEqual(result, ["anthropic/claude-opus-4-7", "anthropic/claude-opus-4-6"]);
});

test("readStrongReasoningOpusCandidates returns [] when models.json is missing (no throw)", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "second-model-opus-missing-"));
  const result = await readStrongReasoningOpusCandidates(cwd);
  assert.deepEqual(result, []);
});

test("readStrongReasoningOpusCandidates returns [] when strong_reasoning capability is absent", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "second-model-opus-empty-"));
  await mkdir(join(cwd, ".pi", "agent"), { recursive: true });
  await writeFile(
    join(cwd, ".pi", "agent", "models.json"),
    JSON.stringify({ capabilities: { economy_reasoning: { description: "x", model_ids: ["openai-codex/gpt-5.4-mini"] } } }),
  );
  const result = await readStrongReasoningOpusCandidates(cwd);
  assert.deepEqual(result, []);
});
