/**
 * Typed contract + CLI emitter for the
 * `reports/validation/<date>_product-pipeline-e2e.json` shape.
 *
 * Unlike the generic `validator-report.ts` contract (ADR-0007), this
 * validator emits a rich custom schema with phase-by-phase artifact
 * checking, HITL gate evidence, idempotency proof, and safety
 * boundary claims. `tests/integration/product-pipeline-e2e.test.ts`
 * reads specific fields (`status`, `initiativeId`,
 * `boundedFullAutoReadiness`, `phases[].phase`, etc.) so the byte
 * shape is load-bearing.
 *
 * The bash validator (`scripts/validate-product-pipeline-e2e.sh`)
 * writes the summary as an intermediate JSON via Python, then
 * invokes this emitter to validate the shape and write the canonical
 * final JSON to the user-requested path. Byte-equivalence with the
 * prior inline Python emission is locked down by the golden test in
 * `tests/extension-units/product-pipeline-e2e-report.test.ts`.
 */

import { readFile, writeFile } from "node:fs/promises";

export type ProductPipelineE2EStatus = "pass" | "fail";
export type ProductPipelineE2EReadiness = "ready" | "blocked";
export type ProductPipelineE2EGoNoGo = "go" | "no_go";
export type ProductPipelineE2EBlockedStatus = "blocked" | "waiting_for_human";

export interface ProductPipelineE2EPhase {
  readonly phase: string;
  readonly status: ProductPipelineE2EStatus;
  readonly artifacts: readonly string[];
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
  readonly nextActions: readonly string[];
}

export interface ProductPipelineE2EBlockedPath {
  readonly id: string;
  readonly phase: string;
  readonly status: ProductPipelineE2EBlockedStatus;
  readonly nextAction: string;
  readonly blockers: readonly string[];
}

export interface ProductPipelineE2EIdempotency {
  readonly status: ProductPipelineE2EStatus;
  readonly evidence: readonly string[];
}

export interface ProductPipelineE2EObservability {
  readonly reportsWritten: readonly string[];
  readonly logsReferenced: readonly string[];
  readonly missingEvidence: readonly string[];
}

export interface ProductPipelineE2EGoNoGoDecision {
  readonly decision: ProductPipelineE2EGoNoGo;
  readonly reasons: readonly string[];
}

export interface ProductPipelineE2ESafety {
  readonly liveProviderCalls: number;
  readonly liveStitchCalls: number;
  readonly trackedRuntimeJsonFiles: readonly string[];
  readonly productImplementationOutputs: readonly string[];
  readonly daemonOrWatchModeIntroduced: boolean;
}

export interface ProductPipelineE2EReport {
  readonly version: 1;
  readonly initiativeId: string;
  readonly status: ProductPipelineE2EStatus;
  readonly boundedFullAutoReadiness: ProductPipelineE2EReadiness;
  readonly phases: readonly ProductPipelineE2EPhase[];
  readonly hitlGatesProven: readonly string[];
  readonly blockedPathsProven: readonly string[];
  readonly blockedPathDetails: readonly ProductPipelineE2EBlockedPath[];
  readonly idempotency: ProductPipelineE2EIdempotency;
  readonly observability: ProductPipelineE2EObservability;
  readonly goNoGo: ProductPipelineE2EGoNoGoDecision;
  readonly safety: ProductPipelineE2ESafety;
}

export class ProductPipelineE2EReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductPipelineE2EReportError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function requireString(parent: string, field: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new ProductPipelineE2EReportError(
      `${parent}.${field} must be a string (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

function requireStringArray(parent: string, field: string, value: unknown): string[] {
  if (!isStringArray(value)) {
    throw new ProductPipelineE2EReportError(
      `${parent}.${field} must be an array of strings`,
    );
  }
  return value;
}

function requireStatus(parent: string, field: string, value: unknown): ProductPipelineE2EStatus {
  if (value !== "pass" && value !== "fail") {
    throw new ProductPipelineE2EReportError(
      `${parent}.${field} must be "pass" or "fail" (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

function parsePhase(raw: unknown, index: number): ProductPipelineE2EPhase {
  const where = `phases[${index}]`;
  if (!isRecord(raw)) {
    throw new ProductPipelineE2EReportError(`${where} must be an object`);
  }
  return {
    phase: requireString(where, "phase", raw.phase),
    status: requireStatus(where, "status", raw.status),
    artifacts: requireStringArray(where, "artifacts", raw.artifacts),
    evidence: requireStringArray(where, "evidence", raw.evidence),
    blockers: requireStringArray(where, "blockers", raw.blockers),
    nextActions: requireStringArray(where, "nextActions", raw.nextActions),
  };
}

function parseBlockedPath(raw: unknown, index: number): ProductPipelineE2EBlockedPath {
  const where = `blockedPathDetails[${index}]`;
  if (!isRecord(raw)) {
    throw new ProductPipelineE2EReportError(`${where} must be an object`);
  }
  const status = raw.status;
  if (status !== "blocked" && status !== "waiting_for_human") {
    throw new ProductPipelineE2EReportError(
      `${where}.status must be "blocked" or "waiting_for_human" (got ${JSON.stringify(status)})`,
    );
  }
  return {
    id: requireString(where, "id", raw.id),
    phase: requireString(where, "phase", raw.phase),
    status,
    nextAction: requireString(where, "nextAction", raw.nextAction),
    blockers: requireStringArray(where, "blockers", raw.blockers),
  };
}

export function parseProductPipelineE2EReport(raw: unknown): ProductPipelineE2EReport {
  if (!isRecord(raw)) {
    throw new ProductPipelineE2EReportError("report: expected a JSON object");
  }
  if (raw.version !== 1) {
    throw new ProductPipelineE2EReportError(
      `report.version must be 1 (got ${JSON.stringify(raw.version)})`,
    );
  }
  const initiativeId = requireString("report", "initiativeId", raw.initiativeId);
  const status = requireStatus("report", "status", raw.status);
  const readiness = raw.boundedFullAutoReadiness;
  if (readiness !== "ready" && readiness !== "blocked") {
    throw new ProductPipelineE2EReportError(
      `report.boundedFullAutoReadiness must be "ready" or "blocked" (got ${JSON.stringify(readiness)})`,
    );
  }
  if (!Array.isArray(raw.phases)) {
    throw new ProductPipelineE2EReportError(`report.phases must be an array`);
  }
  const phases = raw.phases.map((p, i) => parsePhase(p, i));

  if (!Array.isArray(raw.blockedPathDetails)) {
    throw new ProductPipelineE2EReportError(`report.blockedPathDetails must be an array`);
  }
  const blockedPathDetails = raw.blockedPathDetails.map((p, i) => parseBlockedPath(p, i));

  if (!isRecord(raw.idempotency)) {
    throw new ProductPipelineE2EReportError(`report.idempotency must be an object`);
  }
  const idempotency: ProductPipelineE2EIdempotency = {
    status: requireStatus("idempotency", "status", raw.idempotency.status),
    evidence: requireStringArray("idempotency", "evidence", raw.idempotency.evidence),
  };

  if (!isRecord(raw.observability)) {
    throw new ProductPipelineE2EReportError(`report.observability must be an object`);
  }
  const observability: ProductPipelineE2EObservability = {
    reportsWritten: requireStringArray("observability", "reportsWritten", raw.observability.reportsWritten),
    logsReferenced: requireStringArray("observability", "logsReferenced", raw.observability.logsReferenced),
    missingEvidence: requireStringArray("observability", "missingEvidence", raw.observability.missingEvidence),
  };

  if (!isRecord(raw.goNoGo)) {
    throw new ProductPipelineE2EReportError(`report.goNoGo must be an object`);
  }
  const decision = raw.goNoGo.decision;
  if (decision !== "go" && decision !== "no_go") {
    throw new ProductPipelineE2EReportError(
      `report.goNoGo.decision must be "go" or "no_go" (got ${JSON.stringify(decision)})`,
    );
  }
  const goNoGo: ProductPipelineE2EGoNoGoDecision = {
    decision,
    reasons: requireStringArray("goNoGo", "reasons", raw.goNoGo.reasons),
  };

  if (!isRecord(raw.safety)) {
    throw new ProductPipelineE2EReportError(`report.safety must be an object`);
  }
  const safetyRaw = raw.safety;
  if (typeof safetyRaw.liveProviderCalls !== "number" || !Number.isInteger(safetyRaw.liveProviderCalls)) {
    throw new ProductPipelineE2EReportError(`safety.liveProviderCalls must be an integer`);
  }
  if (typeof safetyRaw.liveStitchCalls !== "number" || !Number.isInteger(safetyRaw.liveStitchCalls)) {
    throw new ProductPipelineE2EReportError(`safety.liveStitchCalls must be an integer`);
  }
  if (typeof safetyRaw.daemonOrWatchModeIntroduced !== "boolean") {
    throw new ProductPipelineE2EReportError(`safety.daemonOrWatchModeIntroduced must be a boolean`);
  }
  const safety: ProductPipelineE2ESafety = {
    liveProviderCalls: safetyRaw.liveProviderCalls,
    liveStitchCalls: safetyRaw.liveStitchCalls,
    trackedRuntimeJsonFiles: requireStringArray("safety", "trackedRuntimeJsonFiles", safetyRaw.trackedRuntimeJsonFiles),
    productImplementationOutputs: requireStringArray("safety", "productImplementationOutputs", safetyRaw.productImplementationOutputs),
    daemonOrWatchModeIntroduced: safetyRaw.daemonOrWatchModeIntroduced,
  };

  return {
    version: 1,
    initiativeId,
    status,
    boundedFullAutoReadiness: readiness,
    phases,
    hitlGatesProven: requireStringArray("report", "hitlGatesProven", raw.hitlGatesProven),
    blockedPathsProven: requireStringArray("report", "blockedPathsProven", raw.blockedPathsProven),
    blockedPathDetails,
    idempotency,
    observability,
    goNoGo,
    safety,
  };
}

/**
 * Serializes the validated report to JSON in canonical order matching
 * the prior inline Python `json.dump(summary, f, indent=2); f.write("\n")`
 * output byte-for-byte. Key order across all object literals is the
 * declaration order below; that order matches what the Python script
 * produces because Python's `json.dump` preserves dict insertion
 * order and the source Python dict uses the same declaration order.
 */
export function productPipelineE2EReportToCanonicalJson(report: ProductPipelineE2EReport): string {
  const ordered = {
    version: report.version,
    initiativeId: report.initiativeId,
    status: report.status,
    boundedFullAutoReadiness: report.boundedFullAutoReadiness,
    phases: report.phases.map((p) => ({
      phase: p.phase,
      status: p.status,
      artifacts: [...p.artifacts],
      evidence: [...p.evidence],
      blockers: [...p.blockers],
      nextActions: [...p.nextActions],
    })),
    hitlGatesProven: [...report.hitlGatesProven],
    blockedPathsProven: [...report.blockedPathsProven],
    blockedPathDetails: report.blockedPathDetails.map((b) => ({
      id: b.id,
      phase: b.phase,
      status: b.status,
      nextAction: b.nextAction,
      blockers: [...b.blockers],
    })),
    idempotency: {
      status: report.idempotency.status,
      evidence: [...report.idempotency.evidence],
    },
    observability: {
      reportsWritten: [...report.observability.reportsWritten],
      logsReferenced: [...report.observability.logsReferenced],
      missingEvidence: [...report.observability.missingEvidence],
    },
    goNoGo: {
      decision: report.goNoGo.decision,
      reasons: [...report.goNoGo.reasons],
    },
    safety: {
      liveProviderCalls: report.safety.liveProviderCalls,
      liveStitchCalls: report.safety.liveStitchCalls,
      trackedRuntimeJsonFiles: [...report.safety.trackedRuntimeJsonFiles],
      productImplementationOutputs: [...report.safety.productImplementationOutputs],
      daemonOrWatchModeIntroduced: report.safety.daemonOrWatchModeIntroduced,
    },
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

interface ParsedArgs {
  readonly input: string;
  readonly out: string;
}

function takeValue(argv: readonly string[], i: number, flag: string): string {
  const next = argv[i + 1];
  if (typeof next !== "string" || next.length === 0 || next.startsWith("-")) {
    throw new Error(`${flag} requires a non-empty path argument`);
  }
  return next;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let input: string | null = null;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      input = takeValue(argv, i, "--input");
      i += 1;
    } else if (arg === "--out") {
      out = takeValue(argv, i, "--out");
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: emit-product-pipeline-e2e-report --input <intermediate.json> --out <canonical.json>\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!input) throw new Error(`--input is required`);
  if (!out) throw new Error(`--out is required`);
  return { input, out };
}

export async function runEmitter(argv: readonly string[]): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`emit-product-pipeline-e2e-report: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  let raw: string;
  try {
    raw = await readFile(args.input, "utf8");
  } catch (error) {
    process.stderr.write(`emit-product-pipeline-e2e-report: failed to read input ${args.input}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    process.stderr.write(`emit-product-pipeline-e2e-report: input is not valid JSON: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  let report: ProductPipelineE2EReport;
  try {
    report = parseProductPipelineE2EReport(parsed);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  const canonical = productPipelineE2EReportToCanonicalJson(report);
  try {
    await writeFile(args.out, canonical, "utf8");
  } catch (error) {
    process.stderr.write(`emit-product-pipeline-e2e-report: failed to write ${args.out}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  return 0;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runEmitter(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`emit-product-pipeline-e2e-report: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
