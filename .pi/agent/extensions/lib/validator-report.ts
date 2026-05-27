/**
 * Typed contract for the `reports/validation/*-validation-script.json`
 * shape that 19+ bash validators (and 3 .mjs ones) currently emit by
 * hand-rolling JSON inline. Consumers parse this shape today:
 *
 * - `scripts/collect-harness-tuning-data.sh:152-165` reads `status` and
 *   `failedChecks`.
 * - `scripts/harness-integrate.ts:111-123` invokes validators with
 *   `--report <md-path> --summary-json <json-path>` and consumes both.
 *
 * The TS emitter (`scripts/lib/emit-validator-report.ts`) writes JSON
 * via `validatorReportToCanonicalJson` so the byte-for-byte shape stays
 * compatible with the existing Python emission. Future per-validator
 * migrations (one per PR) replace each bash validator's inline emission
 * with a call to the TS emitter.
 */

export type ValidatorCheckStatus = "PASS" | "FAIL" | "SKIP" | "WARN";
export type ValidatorReportStatus = "PASS" | "FAIL" | "WARN";

export interface ValidatorCheck {
  readonly name: string;
  readonly status: ValidatorCheckStatus;
  readonly detail: string;
}

export interface ValidatorReport {
  readonly status: ValidatorReportStatus;
  readonly failedChecks: number;
  readonly checks: readonly ValidatorCheck[];
}

const ALL_CHECK_STATUSES: readonly ValidatorCheckStatus[] = ["PASS", "FAIL", "SKIP", "WARN"];

function isCheckStatus(value: unknown): value is ValidatorCheckStatus {
  return typeof value === "string" && (ALL_CHECK_STATUSES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Computes the top-level `status` from a check list using the same
 * rule the existing Python emission applies:
 *
 *   any FAIL → "FAIL"
 *   any WARN (and no FAIL) → "WARN"
 *   otherwise → "PASS"
 *
 * SKIP checks do not affect the overall status (they are an
 * intentional "this check was not run" signal, not a problem).
 */
export function deriveReportStatus(
  checks: readonly ValidatorCheck[],
): ValidatorReportStatus {
  let sawWarn = false;
  for (const check of checks) {
    if (check.status === "FAIL") return "FAIL";
    if (check.status === "WARN") sawWarn = true;
  }
  return sawWarn ? "WARN" : "PASS";
}

/**
 * Counts checks whose status is "FAIL". Matches the existing Python
 * emission's `FAILED_CHECKS` counter.
 */
export function countFailedChecks(checks: readonly ValidatorCheck[]): number {
  let n = 0;
  for (const check of checks) {
    if (check.status === "FAIL") n += 1;
  }
  return n;
}

export class ValidatorReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidatorReportError";
  }
}

/**
 * Validates an unknown value against the `ValidatorReport` shape and
 * returns it typed. Throws `ValidatorReportError` on any deviation —
 * the canonical-emission consumers depend on the exact shape, so
 * silent coercion would mask producer bugs.
 */
export function parseValidatorReport(raw: unknown): ValidatorReport {
  if (!isRecord(raw)) {
    throw new ValidatorReportError("validator report: expected a JSON object");
  }
  const status = raw.status;
  if (status !== "PASS" && status !== "FAIL" && status !== "WARN") {
    throw new ValidatorReportError(
      `validator report: status must be one of "PASS"|"FAIL"|"WARN" (got ${JSON.stringify(status)})`,
    );
  }
  const failedChecks = raw.failedChecks;
  if (typeof failedChecks !== "number" || !Number.isInteger(failedChecks) || failedChecks < 0) {
    throw new ValidatorReportError(
      `validator report: failedChecks must be a non-negative integer (got ${JSON.stringify(failedChecks)})`,
    );
  }
  const checksRaw = raw.checks;
  if (!Array.isArray(checksRaw)) {
    throw new ValidatorReportError("validator report: checks must be an array");
  }
  const checks: ValidatorCheck[] = [];
  for (let i = 0; i < checksRaw.length; i += 1) {
    const item = checksRaw[i];
    if (!isRecord(item)) {
      throw new ValidatorReportError(`validator report: checks[${i}] must be an object`);
    }
    const name = item.name;
    if (typeof name !== "string" || name.length === 0) {
      throw new ValidatorReportError(`validator report: checks[${i}].name must be a non-empty string`);
    }
    if (!isCheckStatus(item.status)) {
      throw new ValidatorReportError(
        `validator report: checks[${i}].status must be one of ${ALL_CHECK_STATUSES.join("|")} (got ${JSON.stringify(item.status)})`,
      );
    }
    if (typeof item.detail !== "string") {
      throw new ValidatorReportError(`validator report: checks[${i}].detail must be a string`);
    }
    checks.push({ name, status: item.status, detail: item.detail });
  }
  // Re-derive status + failedChecks from the checks and assert
  // consistency. The producer is supposed to set them but parser
  // catches drift between checks list and aggregate fields.
  const derivedStatus = deriveReportStatus(checks);
  if (derivedStatus !== status) {
    throw new ValidatorReportError(
      `validator report: top-level status ${JSON.stringify(status)} disagrees with derived ${JSON.stringify(derivedStatus)} from checks`,
    );
  }
  const derivedFailed = countFailedChecks(checks);
  if (derivedFailed !== failedChecks) {
    throw new ValidatorReportError(
      `validator report: failedChecks ${failedChecks} disagrees with ${derivedFailed} FAIL entries`,
    );
  }
  return { status, failedChecks, checks };
}

export interface ValidatorReportBuilder {
  addCheck(check: ValidatorCheck): ValidatorReportBuilder;
  build(): ValidatorReport;
}

/**
 * Imperatively assembles a `ValidatorReport`. Producers (today: a
 * thin TS adapter for bash validators; future: per-validator
 * migrations) push checks in order; `build` derives `status` and
 * `failedChecks` so they cannot drift.
 */
export function createValidatorReportBuilder(): ValidatorReportBuilder {
  const checks: ValidatorCheck[] = [];
  const builder: ValidatorReportBuilder = {
    addCheck(check) {
      checks.push({ name: check.name, status: check.status, detail: check.detail });
      return builder;
    },
    build() {
      return {
        status: deriveReportStatus(checks),
        failedChecks: countFailedChecks(checks),
        checks: [...checks],
      };
    },
  };
  return builder;
}

/**
 * Renders a `ValidatorReport` as JSON matching the existing Python
 * emission byte-for-byte:
 *
 *   { keys: status, failedChecks, checks } in that order
 *   indent = 2 spaces
 *   trailing newline
 *   no trailing whitespace per line
 *   key order inside each check: name, status, detail
 *
 * Locking the byte shape lets `collect-harness-tuning-data.sh` and
 * `harness-integrate.ts` swap producers transparently per follow-up
 * PR without coordinating the cutover.
 */
export function validatorReportToCanonicalJson(report: ValidatorReport): string {
  const ordered = {
    status: report.status,
    failedChecks: report.failedChecks,
    checks: report.checks.map((c) => ({
      name: c.name,
      status: c.status,
      detail: c.detail,
    })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
