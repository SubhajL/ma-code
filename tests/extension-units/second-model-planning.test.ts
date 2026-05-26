import assert from "node:assert/strict";
import test from "node:test";

import {
  orderedSecondaryCandidates,
  type SecondaryCandidateSources,
} from "../../.pi/agent/extensions/second-model-planning.ts";

const NO_HINTS = {
  codexConfigPath: "/dev/null",
  hasGeminiMcp: false,
  preferredModels: [],
};

function modelLike(provider: string, id: string): { provider: string; id: string } {
  return { provider, id };
}

const OPUS_47 = modelLike("anthropic", "claude-opus-4-7");
const GPT_55 = modelLike("openai-codex", "gpt-5.5");
const SONNET_46 = modelLike("anthropic", "claude-sonnet-4-6");
const SPARK = modelLike("openai-codex", "gpt-5.3-codex-spark");
const MINI = modelLike("openai-codex", "gpt-5.4-mini");

function baseSources(overrides: Partial<SecondaryCandidateSources> = {}): SecondaryCandidateSources {
  return {
    available: [OPUS_47, GPT_55, SONNET_46, SPARK, MINI],
    currentKey: null,
    repoPlanningOverrides: [],
    operatorHints: NO_HINTS,
    strongReasoningCandidates: [],
    economyReasoningCandidates: [],
    ...overrides,
  };
}

test("orderedSecondaryCandidates places explicit user preferences first", () => {
  const result = orderedSecondaryCandidates(
    baseSources({
      preferred: ["openai-codex/gpt-5.5"],
      strongReasoningCandidates: ["anthropic/claude-opus-4-7"],
    }),
  );
  assert.equal(result[0]?.id, "gpt-5.5");
  assert.equal(result[1]?.id, "claude-opus-4-7");
});

test("orderedSecondaryCandidates honours configured strong_reasoning order over legacy literals", () => {
  const result = orderedSecondaryCandidates(
    baseSources({
      strongReasoningCandidates: [
        "anthropic/claude-opus-4-7",
        "openai-codex/gpt-5.5",
        "anthropic/claude-sonnet-4-6",
      ],
    }),
  );
  assert.deepEqual(
    result.map((model) => `${model.provider}/${model.id}`).slice(0, 3),
    ["anthropic/claude-opus-4-7", "openai-codex/gpt-5.5", "anthropic/claude-sonnet-4-6"],
  );
});

test("orderedSecondaryCandidates appends repoPlanningOverrides after strong_reasoning", () => {
  const result = orderedSecondaryCandidates(
    baseSources({
      strongReasoningCandidates: ["anthropic/claude-opus-4-7"],
      repoPlanningOverrides: ["openai-codex/gpt-5.3-codex-spark"],
    }),
  );
  assert.deepEqual(
    result.map((model) => `${model.provider}/${model.id}`),
    ["anthropic/claude-opus-4-7", "openai-codex/gpt-5.3-codex-spark"],
  );
});

test("orderedSecondaryCandidates uses economy_reasoning candidates as low-priority fallback", () => {
  const result = orderedSecondaryCandidates(
    baseSources({
      strongReasoningCandidates: ["anthropic/claude-opus-4-7"],
      economyReasoningCandidates: ["openai-codex/gpt-5.4-mini"],
    }),
  );
  const ids = result.map((model) => model.id);
  assert.ok(ids.indexOf("claude-opus-4-7") < ids.indexOf("gpt-5.4-mini"));
});

test("orderedSecondaryCandidates skips the current model and deduplicates repeated preferences", () => {
  const result = orderedSecondaryCandidates(
    baseSources({
      currentKey: "anthropic/claude-opus-4-7",
      strongReasoningCandidates: [
        "anthropic/claude-opus-4-7",
        "openai-codex/gpt-5.5",
        "openai-codex/gpt-5.5",
      ],
    }),
  );
  assert.ok(!result.some((model) => `${model.provider}/${model.id}` === "anthropic/claude-opus-4-7"));
  const gptCount = result.filter((model) => model.id === "gpt-5.5").length;
  assert.equal(gptCount, 1);
});

test("orderedSecondaryCandidates omits candidates not present in the available registry", () => {
  const result = orderedSecondaryCandidates(
    baseSources({
      strongReasoningCandidates: ["nonexistent-provider/imaginary-model"],
    }),
  );
  assert.ok(!result.some((model) => model.id === "imaginary-model"));
});
