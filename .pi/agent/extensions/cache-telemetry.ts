export interface UpstreamUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
}

export interface CacheTelemetryRecord {
  version: 1;
  recordedAt: string;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheHitRate: number;
  costTotal: number | null;
  costCacheRead: number | null;
  costCacheWrite: number | null;
}

export interface SummarizeUsageOptions {
  recordedAt?: string;
  provider?: string | null;
  model?: string | null;
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function summarizeUsage(usage: UpstreamUsage, options: SummarizeUsageOptions = {}): CacheTelemetryRecord {
  const input = safeNumber(usage.input);
  const output = safeNumber(usage.output);
  const cacheRead = safeNumber(usage.cacheRead);
  const cacheWrite = safeNumber(usage.cacheWrite);
  const cacheEligible = input + cacheRead;
  const cacheHitRate = cacheEligible > 0 ? cacheRead / cacheEligible : 0;
  return {
    version: 1,
    recordedAt: options.recordedAt ?? new Date().toISOString(),
    provider: options.provider ?? null,
    model: options.model ?? null,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    cacheHitRate: Number(cacheHitRate.toFixed(4)),
    costTotal: safeOptionalNumber(usage.cost?.total),
    costCacheRead: safeOptionalNumber(usage.cost?.cacheRead),
    costCacheWrite: safeOptionalNumber(usage.cost?.cacheWrite),
  };
}

export interface AggregateCacheTelemetry {
  recordCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  overallCacheHitRate: number;
  totalCost: number;
}

export function aggregateCacheTelemetry(records: CacheTelemetryRecord[]): AggregateCacheTelemetry {
  let inputSum = 0;
  let outputSum = 0;
  let cacheReadSum = 0;
  let cacheWriteSum = 0;
  let costSum = 0;
  for (const record of records) {
    inputSum += record.inputTokens;
    outputSum += record.outputTokens;
    cacheReadSum += record.cacheReadTokens;
    cacheWriteSum += record.cacheWriteTokens;
    if (record.costTotal !== null) costSum += record.costTotal;
  }
  const eligible = inputSum + cacheReadSum;
  const overallCacheHitRate = eligible > 0 ? cacheReadSum / eligible : 0;
  return {
    recordCount: records.length,
    totalInputTokens: inputSum,
    totalOutputTokens: outputSum,
    totalCacheReadTokens: cacheReadSum,
    totalCacheWriteTokens: cacheWriteSum,
    overallCacheHitRate: Number(overallCacheHitRate.toFixed(4)),
    totalCost: Number(costSum.toFixed(6)),
  };
}

export default function cacheTelemetryExtension(): void {}
