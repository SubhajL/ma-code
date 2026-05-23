import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateCacheTelemetry,
  summarizeUsage,
  type UpstreamUsage,
} from "../../.pi/agent/extensions/cache-telemetry.ts";

const FIXED_AT = "2026-05-23T00:00:00.000Z";

test("summarizeUsage records token counts and reports cache hit rate", () => {
  const usage: UpstreamUsage = {
    input: 200,
    output: 50,
    cacheRead: 800,
    cacheWrite: 0,
    cost: { total: 0.012, input: 0.001, output: 0.001, cacheRead: 0.01, cacheWrite: 0 },
  };
  const record = summarizeUsage(usage, { recordedAt: FIXED_AT, provider: "anthropic", model: "claude-opus-4-7" });
  assert.equal(record.version, 1);
  assert.equal(record.recordedAt, FIXED_AT);
  assert.equal(record.provider, "anthropic");
  assert.equal(record.model, "claude-opus-4-7");
  assert.equal(record.inputTokens, 200);
  assert.equal(record.outputTokens, 50);
  assert.equal(record.cacheReadTokens, 800);
  assert.equal(record.cacheWriteTokens, 0);
  // cacheEligible = 200 + 800 = 1000; cacheRead/eligible = 0.8
  assert.equal(record.cacheHitRate, 0.8);
  assert.equal(record.costTotal, 0.012);
});

test("summarizeUsage reports 0 hit rate when no cached tokens are read", () => {
  const usage: UpstreamUsage = { input: 1000, output: 100, cacheRead: 0, cacheWrite: 500 };
  const record = summarizeUsage(usage, { recordedAt: FIXED_AT });
  assert.equal(record.cacheHitRate, 0);
  assert.equal(record.cacheReadTokens, 0);
  assert.equal(record.cacheWriteTokens, 500);
});

test("summarizeUsage reports 0 hit rate when no eligible tokens exist", () => {
  const usage: UpstreamUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const record = summarizeUsage(usage, { recordedAt: FIXED_AT });
  assert.equal(record.cacheHitRate, 0);
});

test("summarizeUsage tolerates non-finite or missing fields", () => {
  const usage = {
    input: Number.NaN,
    output: undefined as unknown as number,
    cacheRead: 100,
    cacheWrite: 0,
  } as UpstreamUsage;
  const record = summarizeUsage(usage, { recordedAt: FIXED_AT });
  assert.equal(record.inputTokens, 0);
  assert.equal(record.outputTokens, 0);
  assert.equal(record.cacheReadTokens, 100);
  // eligible = 0 + 100 = 100; hit rate = 100/100 = 1.0
  assert.equal(record.cacheHitRate, 1);
});

test("summarizeUsage defaults provider and model to null", () => {
  const usage: UpstreamUsage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 };
  const record = summarizeUsage(usage, { recordedAt: FIXED_AT });
  assert.equal(record.provider, null);
  assert.equal(record.model, null);
});

test("aggregateCacheTelemetry returns zeroed aggregate for empty input", () => {
  const aggregate = aggregateCacheTelemetry([]);
  assert.equal(aggregate.recordCount, 0);
  assert.equal(aggregate.totalInputTokens, 0);
  assert.equal(aggregate.overallCacheHitRate, 0);
  assert.equal(aggregate.totalCost, 0);
});

test("aggregateCacheTelemetry sums tokens and computes an overall hit rate", () => {
  const r1 = summarizeUsage(
    { input: 100, output: 20, cacheRead: 400, cacheWrite: 0, cost: { total: 0.005 } },
    { recordedAt: FIXED_AT },
  );
  const r2 = summarizeUsage(
    { input: 200, output: 30, cacheRead: 100, cacheWrite: 0, cost: { total: 0.003 } },
    { recordedAt: FIXED_AT },
  );
  const aggregate = aggregateCacheTelemetry([r1, r2]);
  assert.equal(aggregate.recordCount, 2);
  assert.equal(aggregate.totalInputTokens, 300);
  assert.equal(aggregate.totalOutputTokens, 50);
  assert.equal(aggregate.totalCacheReadTokens, 500);
  // eligible = (100+200) + 500 = 800; cacheRead/eligible = 500/800 = 0.625
  assert.equal(aggregate.overallCacheHitRate, 0.625);
  assert.equal(aggregate.totalCost, 0.008);
});

test("aggregateCacheTelemetry ignores records whose cost is null", () => {
  const r1 = summarizeUsage({ input: 100, output: 0, cacheRead: 0, cacheWrite: 0 }, { recordedAt: FIXED_AT });
  const r2 = summarizeUsage(
    { input: 100, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 } },
    { recordedAt: FIXED_AT },
  );
  const aggregate = aggregateCacheTelemetry([r1, r2]);
  assert.equal(aggregate.totalCost, 0.01);
});
