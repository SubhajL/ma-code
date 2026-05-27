import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  countFailedChecks,
  createValidatorReportBuilder,
  deriveReportStatus,
  parseValidatorReport,
  validatorReportToCanonicalJson,
  ValidatorReportError,
  type ValidatorCheck,
  type ValidatorReport,
} from "../../.pi/agent/extensions/lib/validator-report.ts";

test("deriveReportStatus returns PASS for empty / all-PASS / mixed-with-SKIP", () => {
  assert.equal(deriveReportStatus([]), "PASS");
  assert.equal(
    deriveReportStatus([
      { name: "a", status: "PASS", detail: "ok" },
      { name: "b", status: "SKIP", detail: "deferred" },
    ]),
    "PASS",
  );
});

test("deriveReportStatus returns FAIL when any check FAILs (overrides WARN)", () => {
  assert.equal(
    deriveReportStatus([
      { name: "a", status: "WARN", detail: "soft" },
      { name: "b", status: "FAIL", detail: "hard" },
    ]),
    "FAIL",
  );
});

test("deriveReportStatus returns WARN when WARN present but no FAIL", () => {
  assert.equal(
    deriveReportStatus([
      { name: "a", status: "PASS", detail: "ok" },
      { name: "b", status: "WARN", detail: "soft" },
    ]),
    "WARN",
  );
});

test("countFailedChecks counts only FAIL (SKIP/WARN/PASS do not count)", () => {
  assert.equal(
    countFailedChecks([
      { name: "a", status: "PASS", detail: "" },
      { name: "b", status: "FAIL", detail: "" },
      { name: "c", status: "FAIL", detail: "" },
      { name: "d", status: "SKIP", detail: "" },
      { name: "e", status: "WARN", detail: "" },
    ]),
    2,
  );
});

test("createValidatorReportBuilder derives status + failedChecks from checks", () => {
  const report = createValidatorReportBuilder()
    .addCheck({ name: "1", status: "PASS", detail: "ok" })
    .addCheck({ name: "2", status: "FAIL", detail: "broken" })
    .addCheck({ name: "3", status: "SKIP", detail: "deferred" })
    .build();
  assert.equal(report.status, "FAIL");
  assert.equal(report.failedChecks, 1);
  assert.equal(report.checks.length, 3);
});

test("validatorReportToCanonicalJson matches existing Python emission shape byte-for-byte", async () => {
  // Golden file: a real harness-package validation report previously
  // written by the inline Python emission. The bytes (indent=2 + key
  // order {status, failedChecks, checks} + check key order
  // {name, status, detail} + trailing newline) must round-trip.
  const goldenPath = new URL(
    "../../reports/validation/2026-05-27_harness-package-validation-script.json",
    import.meta.url,
  );
  const golden = await readFile(goldenPath, "utf8");
  const parsed = parseValidatorReport(JSON.parse(golden));
  const canonical = validatorReportToCanonicalJson(parsed);
  assert.equal(canonical, golden, "TS emission must match the golden file byte-for-byte");
});

test("parseValidatorReport rejects non-object input", () => {
  assert.throws(() => parseValidatorReport([]), ValidatorReportError);
  assert.throws(() => parseValidatorReport(null), ValidatorReportError);
  assert.throws(() => parseValidatorReport("PASS"), ValidatorReportError);
});

test("parseValidatorReport rejects unknown top-level status", () => {
  assert.throws(
    () => parseValidatorReport({ status: "OK", failedChecks: 0, checks: [] }),
    /status must be one of/,
  );
});

test("parseValidatorReport rejects negative failedChecks", () => {
  assert.throws(
    () =>
      parseValidatorReport({
        status: "PASS",
        failedChecks: -1,
        checks: [],
      }),
    /failedChecks must be a non-negative integer/,
  );
});

test("parseValidatorReport rejects unknown check status", () => {
  assert.throws(
    () =>
      parseValidatorReport({
        status: "PASS",
        failedChecks: 0,
        checks: [{ name: "x", status: "OK", detail: "" }],
      }),
    /status must be one of PASS|FAIL|SKIP|WARN/,
  );
});

test("parseValidatorReport rejects top-level/checks status drift", () => {
  assert.throws(
    () =>
      parseValidatorReport({
        status: "PASS",
        failedChecks: 0,
        checks: [{ name: "x", status: "FAIL", detail: "broken" }],
      }),
    /top-level status .* disagrees with derived/,
  );
});

test("parseValidatorReport rejects failedChecks/checks count drift", () => {
  assert.throws(
    () =>
      parseValidatorReport({
        status: "FAIL",
        failedChecks: 2, // wrong: only one FAIL in checks
        checks: [
          { name: "a", status: "FAIL", detail: "" },
          { name: "b", status: "PASS", detail: "" },
        ],
      }),
    /failedChecks 2 disagrees with 1 FAIL entries/,
  );
});

test("parseValidatorReport accepts a well-formed report and returns typed value", () => {
  const checks: readonly ValidatorCheck[] = [
    { name: "1", status: "PASS", detail: "ok" },
    { name: "2", status: "SKIP", detail: "deferred" },
  ];
  const input = {
    status: "PASS" as const,
    failedChecks: 0,
    checks,
  };
  const parsed: ValidatorReport = parseValidatorReport(input);
  assert.equal(parsed.status, "PASS");
  assert.equal(parsed.failedChecks, 0);
  assert.deepEqual(parsed.checks, checks);
});

// ------------------------------------------------------------------
// CLI emitter tests — exercises the `scripts/lib/emit-validator-report.ts`
// helper that bash validators shell out to.
// ------------------------------------------------------------------

const EMITTER_PATH = fileURLToPath(
  new URL("../../scripts/lib/emit-validator-report.ts", import.meta.url),
);

async function runEmitterChild(args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--import", "tsx", EMITTER_PATH, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

test("emit-validator-report CLI writes canonical JSON from stdin", async () => {
  const dir = await mkdtemp(join(tmpdir(), "validator-report-cli-"));
  const outPath = join(dir, "summary.json");
  const stdin = JSON.stringify({
    checks: [
      { name: "1", status: "PASS", detail: "ok" },
      { name: "2", status: "FAIL", detail: "broken" },
    ],
  });
  const { code, stderr } = await runEmitterChild(["--out", outPath], stdin);
  assert.equal(code, 0, `emitter exit code, stderr=${stderr}`);
  const written = await readFile(outPath, "utf8");
  const expected = validatorReportToCanonicalJson(
    parseValidatorReport({
      status: "FAIL",
      failedChecks: 1,
      checks: [
        { name: "1", status: "PASS", detail: "ok" },
        { name: "2", status: "FAIL", detail: "broken" },
      ],
    }),
  );
  assert.equal(written, expected);
});

test("emit-validator-report CLI reads from --input file when stdin unused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "validator-report-cli-file-"));
  const inputPath = join(dir, "checks.json");
  const outPath = join(dir, "summary.json");
  await writeFile(
    inputPath,
    JSON.stringify({
      checks: [{ name: "only", status: "PASS", detail: "fine" }],
    }),
    "utf8",
  );
  const { code, stderr } = await runEmitterChild(["--input", inputPath, "--out", outPath]);
  assert.equal(code, 0, `emitter exit code, stderr=${stderr}`);
  const parsed = JSON.parse(await readFile(outPath, "utf8"));
  assert.equal(parsed.status, "PASS");
  assert.equal(parsed.failedChecks, 0);
  assert.equal(parsed.checks.length, 1);
});

test("emit-validator-report CLI exits with 2 on contract violation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "validator-report-cli-bad-"));
  const outPath = join(dir, "summary.json");
  const stdin = JSON.stringify({
    checks: [{ name: "x", status: "INVALID_STATUS", detail: "..." }],
  });
  const { code, stderr } = await runEmitterChild(["--out", outPath], stdin);
  assert.equal(code, 2);
  assert.match(stderr, /status must be one of/);
});

test("emit-validator-report CLI exits with 1 on missing --out", async () => {
  const stdin = JSON.stringify({ checks: [] });
  const { code, stderr } = await runEmitterChild([], stdin);
  assert.equal(code, 1);
  assert.match(stderr, /--out is required/);
});

test("emit-validator-report CLI accepts parallel-file inputs (bash-validator compat mode)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "validator-report-cli-parallel-"));
  const names = join(dir, "names.txt");
  const statuses = join(dir, "statuses.txt");
  const details = join(dir, "details.txt");
  const out = join(dir, "summary.json");
  await Promise.all([
    writeFile(names, "1. compile\n2. wire\n", "utf8"),
    writeFile(statuses, "PASS\nFAIL\n", "utf8"),
    writeFile(details, "ok\nbroken\n", "utf8"),
  ]);
  const { code, stderr } = await runEmitterChild([
    "--out",
    out,
    "--names-file",
    names,
    "--statuses-file",
    statuses,
    "--details-file",
    details,
  ]);
  assert.equal(code, 0, `stderr=${stderr}`);
  const written = JSON.parse(await readFile(out, "utf8"));
  assert.equal(written.status, "FAIL");
  assert.equal(written.failedChecks, 1);
  assert.equal(written.checks.length, 2);
  assert.equal(written.checks[0].name, "1. compile");
  assert.equal(written.checks[1].status, "FAIL");
});

test("emit-validator-report CLI rejects mismatched parallel-file lengths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "validator-report-cli-bad-parallel-"));
  const names = join(dir, "names.txt");
  const statuses = join(dir, "statuses.txt");
  const details = join(dir, "details.txt");
  const out = join(dir, "summary.json");
  await Promise.all([
    writeFile(names, "a\nb\n", "utf8"),
    writeFile(statuses, "PASS\n", "utf8"),
    writeFile(details, "x\ny\n", "utf8"),
  ]);
  const { code, stderr } = await runEmitterChild([
    "--out",
    out,
    "--names-file",
    names,
    "--statuses-file",
    statuses,
    "--details-file",
    details,
  ]);
  assert.equal(code, 2);
  assert.match(stderr, /parallel files disagree on length/);
});
