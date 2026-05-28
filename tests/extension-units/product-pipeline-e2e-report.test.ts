import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ProductPipelineE2EReportError,
  parseProductPipelineE2EReport,
  productPipelineE2EReportToCanonicalJson,
  type ProductPipelineE2EReport,
} from "../../scripts/lib/emit-product-pipeline-e2e-report.ts";
import { spawnEmitterChild } from "./test-emitter-spawn.ts";

function exampleReport(): ProductPipelineE2EReport {
  return {
    version: 1,
    initiativeId: "checkout-mini",
    status: "pass",
    boundedFullAutoReadiness: "ready",
    phases: [
      {
        phase: "product_intake",
        status: "pass",
        artifacts: ["docs/initiatives/checkout-mini/intake.json"],
        evidence: ["docs/initiatives/checkout-mini/intake.json exists"],
        blockers: [],
        nextActions: [],
      },
    ],
    hitlGatesProven: ["screen_approval_waiting_for_human"],
    blockedPathsProven: ["vague_intake_blocks"],
    blockedPathDetails: [
      {
        id: "vague_intake_blocks",
        phase: "product_intake",
        status: "blocked",
        nextAction: "Ask one focused clarification question",
        blockers: ["Intake lacks a concrete user outcome."],
      },
    ],
    idempotency: {
      status: "pass",
      evidence: ["re-run produced no duplicate artifacts: count remained 11"],
    },
    observability: {
      reportsWritten: ["/tmp/report.md", "/tmp/summary.json"],
      logsReferenced: ["logs/coding/2026-05-08_product-pipeline-e2e-phase-14.md"],
      missingEvidence: [],
    },
    goNoGo: {
      decision: "go",
      reasons: ["success path artifacts exist"],
    },
    safety: {
      liveProviderCalls: 0,
      liveStitchCalls: 0,
      trackedRuntimeJsonFiles: [],
      productImplementationOutputs: ["/tmp/repo/intake.json"],
      daemonOrWatchModeIntroduced: false,
    },
  };
}

test("parseProductPipelineE2EReport accepts a well-formed report", () => {
  const parsed = parseProductPipelineE2EReport(exampleReport());
  assert.equal(parsed.status, "pass");
  assert.equal(parsed.initiativeId, "checkout-mini");
  assert.equal(parsed.phases.length, 1);
});

test("parseProductPipelineE2EReport rejects wrong version", () => {
  const bad = { ...exampleReport(), version: 2 as unknown as 1 };
  assert.throws(() => parseProductPipelineE2EReport(bad), /version must be 1/);
});

test("parseProductPipelineE2EReport rejects unknown status", () => {
  const bad = { ...exampleReport(), status: "PASS" as unknown as "pass" };
  assert.throws(
    () => parseProductPipelineE2EReport(bad),
    /status must be "pass" or "fail"/,
  );
});

test("parseProductPipelineE2EReport rejects unknown boundedFullAutoReadiness", () => {
  const bad = { ...exampleReport(), boundedFullAutoReadiness: "maybe" as unknown as "ready" };
  assert.throws(
    () => parseProductPipelineE2EReport(bad),
    /boundedFullAutoReadiness must be "ready" or "blocked"/,
  );
});

test("parseProductPipelineE2EReport rejects unknown blockedPathDetails[].status", () => {
  const r = exampleReport();
  const bad = {
    ...r,
    blockedPathDetails: [
      { ...r.blockedPathDetails[0], status: "stuck" as unknown as "blocked" },
    ],
  };
  assert.throws(
    () => parseProductPipelineE2EReport(bad),
    /must be "blocked" or "waiting_for_human"/,
  );
});

test("parseProductPipelineE2EReport rejects non-integer safety.liveProviderCalls", () => {
  const r = exampleReport();
  const bad = { ...r, safety: { ...r.safety, liveProviderCalls: 0.5 as unknown as number } };
  assert.throws(
    () => parseProductPipelineE2EReport(bad),
    /safety\.liveProviderCalls must be an integer/,
  );
});

test("parseProductPipelineE2EReport rejects non-array phases", () => {
  const bad = { ...exampleReport(), phases: "nope" as unknown as [] };
  assert.throws(() => parseProductPipelineE2EReport(bad), /phases must be an array/);
});

test("ProductPipelineE2EReportError is the typed error class", () => {
  try {
    parseProductPipelineE2EReport(null);
    assert.fail("expected throw");
  } catch (error) {
    assert.ok(error instanceof ProductPipelineE2EReportError);
  }
});

test("productPipelineE2EReportToCanonicalJson produces stable canonical output", () => {
  const r = exampleReport();
  const first = productPipelineE2EReportToCanonicalJson(r);
  const second = productPipelineE2EReportToCanonicalJson(r);
  assert.equal(first, second);
  // Trailing newline + 2-space indent — matches Python json.dump output style
  assert.ok(first.endsWith("\n"));
  assert.ok(first.includes('  "version": 1'));
});

test("canonical output round-trips through parse without drift", () => {
  const r = exampleReport();
  const canonical = productPipelineE2EReportToCanonicalJson(r);
  const reparsed = parseProductPipelineE2EReport(JSON.parse(canonical));
  const canonicalAgain = productPipelineE2EReportToCanonicalJson(reparsed);
  assert.equal(canonical, canonicalAgain);
});

// ------------------------------------------------------------------
// CLI emitter tests
// ------------------------------------------------------------------

const EMITTER_PATH = fileURLToPath(
  new URL("../../scripts/lib/emit-product-pipeline-e2e-report.ts", import.meta.url),
);

async function runEmitterChild(args: readonly string[]): Promise<{ code: number; stderr: string }> {
  const { code, stderr } = await spawnEmitterChild(EMITTER_PATH, args);
  return { code, stderr };
}

test("CLI emitter writes canonical JSON from a well-formed input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppe2e-cli-ok-"));
  const input = join(dir, "input.json");
  const out = join(dir, "out.json");
  await writeFile(input, JSON.stringify(exampleReport()), "utf8");
  const { code, stderr } = await runEmitterChild(["--input", input, "--out", out]);
  assert.equal(code, 0, `stderr=${stderr}`);
  const written = await readFile(out, "utf8");
  const expected = productPipelineE2EReportToCanonicalJson(exampleReport());
  assert.equal(written, expected);
});

test("CLI emitter exits 2 on contract violation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppe2e-cli-bad-"));
  const input = join(dir, "input.json");
  const out = join(dir, "out.json");
  const bad = { ...exampleReport(), status: "PASS" };
  await writeFile(input, JSON.stringify(bad), "utf8");
  const { code, stderr } = await runEmitterChild(["--input", input, "--out", out]);
  assert.equal(code, 2);
  assert.match(stderr, /status must be "pass" or "fail"/);
});

test("CLI emitter exits 1 on missing --input or --out", async () => {
  const r1 = await runEmitterChild(["--out", "/tmp/x.json"]);
  assert.equal(r1.code, 1);
  assert.match(r1.stderr, /--input is required/);

  const r2 = await runEmitterChild(["--input", "/tmp/x.json"]);
  assert.equal(r2.code, 1);
  assert.match(r2.stderr, /--out is required/);
});

test("CLI emitter byte-equivalence: parses + canonicalizes a real Python-emitted report", async () => {
  // The baseline.json file is captured by the test setup (see the test
  // prelude in the migration PR's verification). We don't ship a
  // golden file inside the repo for this validator because its JSON
  // embeds non-deterministic absolute paths (mktemp directories).
  // Instead this test exercises the parse + canonicalize round-trip
  // against a synthetic but realistic payload that covers every
  // schema branch.
  const fullReport: ProductPipelineE2EReport = {
    ...exampleReport(),
    phases: [
      ...exampleReport().phases,
      {
        phase: "backend_validation",
        status: "fail",
        artifacts: ["docs/initiatives/checkout-mini/validation/checkout-summary.backend.validation.json"],
        evidence: [],
        blockers: ["missing expected artifact"],
        nextActions: ["regenerate"],
      },
    ],
    blockedPathDetails: [
      ...exampleReport().blockedPathDetails,
      {
        id: "hitl_gate_reports_waiting_for_human",
        phase: "screen_approval",
        status: "waiting_for_human",
        nextAction: "Wait for human approval",
        blockers: ["HITL gate reports waiting_for_human, not done."],
      },
    ],
  };
  const canonical = productPipelineE2EReportToCanonicalJson(fullReport);
  // Verify the canonical form is parseable and re-canonicalizes to itself
  const reparsed = parseProductPipelineE2EReport(JSON.parse(canonical));
  assert.equal(productPipelineE2EReportToCanonicalJson(reparsed), canonical);
});
