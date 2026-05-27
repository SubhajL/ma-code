/**
 * CLI helper: reads a JSON `{ checks: [...] }` blob from stdin (or
 * a file path passed via `--input`), validates it through the typed
 * `ValidatorReport` contract, and writes the canonical JSON to the
 * path passed via `--out`. The output is byte-equivalent to what the
 * inline Python emission used to produce, so existing consumers
 * (`collect-harness-tuning-data.sh`, `harness-integrate.ts`) keep
 * working unchanged.
 *
 * Invocation from a bash validator:
 *
 *   echo "{\"checks\": [...]}" \
 *     | node --import tsx scripts/lib/emit-validator-report.ts \
 *           --out "$SUMMARY_JSON_PATH"
 *
 * Or:
 *
 *   node --import tsx scripts/lib/emit-validator-report.ts \
 *     --input checks.json --out "$SUMMARY_JSON_PATH"
 *
 * Exit code:
 *   0 — JSON written successfully
 *   2 — input failed contract validation (message on stderr)
 *   1 — other I/O failure (message on stderr)
 */

import { readFile, writeFile } from "node:fs/promises";

import {
  createValidatorReportBuilder,
  parseValidatorReport,
  type ValidatorCheckStatus,
  validatorReportToCanonicalJson,
  ValidatorReportError,
} from "../../.pi/agent/extensions/lib/validator-report.ts";

interface ParsedArgs {
  readonly out: string;
  readonly input: string | null;
  readonly namesFile: string | null;
  readonly statusesFile: string | null;
  readonly detailsFile: string | null;
}

function takeValue(argv: readonly string[], i: number, flag: string): string {
  const next = argv[i + 1];
  if (typeof next !== "string" || next.length === 0 || next.startsWith("-")) {
    throw new Error(`${flag} requires a non-empty path argument`);
  }
  return next;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let out: string | null = null;
  let input: string | null = null;
  let namesFile: string | null = null;
  let statusesFile: string | null = null;
  let detailsFile: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      out = takeValue(argv, i, "--out");
      i += 1;
    } else if (arg === "--input") {
      input = takeValue(argv, i, "--input");
      i += 1;
    } else if (arg === "--names-file") {
      namesFile = takeValue(argv, i, "--names-file");
      i += 1;
    } else if (arg === "--statuses-file") {
      statusesFile = takeValue(argv, i, "--statuses-file");
      i += 1;
    } else if (arg === "--details-file") {
      detailsFile = takeValue(argv, i, "--details-file");
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out) {
    throw new Error(`--out is required`);
  }
  const usingParallelFiles = namesFile || statusesFile || detailsFile;
  if (usingParallelFiles) {
    if (!namesFile || !statusesFile || !detailsFile) {
      throw new Error(`--names-file, --statuses-file, and --details-file must all be provided together`);
    }
    if (input) {
      throw new Error(`--input cannot be combined with parallel-file inputs`);
    }
  }
  return { out, input, namesFile, statusesFile, detailsFile };
}

function printUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  emit-validator-report --out <json-path> [--input <checks-json>]",
      "  emit-validator-report --out <json-path> --names-file <path> --statuses-file <path> --details-file <path>",
      "",
      "JSON-input mode: reads { checks: [{name, status, detail}, ...] } from --input",
      "(or stdin if --input is omitted), validates against the typed contract, and",
      "writes canonical JSON to --out.",
      "",
      "Parallel-files mode: reads three newline-delimited files (one entry per line",
      "in each), zips them into checks, and writes canonical JSON. Used by bash",
      "validators that build up parallel CHECK_NAMES/CHECK_STATUS/CHECK_DETAILS arrays.",
      "",
    ].join("\n"),
  );
}

async function readChecksBlob(input: string | null): Promise<string> {
  if (input) {
    return readFile(input, "utf8");
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
    });
    process.stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    process.stdin.on("error", reject);
  });
}

function splitLines(raw: string): string[] {
  // Strip a single trailing newline (the standard bash `printf '%s\n'`
  // emission leaves one) before splitting, so we don't get a phantom
  // empty trailing entry.
  const trimmed = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  if (trimmed.length === 0) return [];
  return trimmed.split("\n");
}

async function readParallelFiles(
  namesPath: string,
  statusesPath: string,
  detailsPath: string,
): Promise<InputShape> {
  const [namesRaw, statusesRaw, detailsRaw] = await Promise.all([
    readFile(namesPath, "utf8"),
    readFile(statusesPath, "utf8"),
    readFile(detailsPath, "utf8"),
  ]);
  const names = splitLines(namesRaw);
  const statuses = splitLines(statusesRaw);
  const details = splitLines(detailsRaw);
  if (names.length !== statuses.length || names.length !== details.length) {
    throw new ValidatorReportError(
      `emit-validator-report: parallel files disagree on length ` +
        `(names=${names.length}, statuses=${statuses.length}, details=${details.length})`,
    );
  }
  const checks: InputCheck[] = [];
  for (let i = 0; i < names.length; i += 1) {
    checks.push({
      name: names[i],
      status: statuses[i] as ValidatorCheckStatus,
      detail: details[i],
    });
  }
  return { checks };
}

interface InputCheck {
  readonly name: string;
  readonly status: ValidatorCheckStatus;
  readonly detail: string;
}

interface InputShape {
  readonly checks: readonly InputCheck[];
}

function parseInputBlob(raw: string): InputShape {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ValidatorReportError(`emit-validator-report: input is not valid JSON: ${message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ValidatorReportError("emit-validator-report: input must be an object with a 'checks' array");
  }
  const checksRaw = (parsed as Record<string, unknown>).checks;
  if (!Array.isArray(checksRaw)) {
    throw new ValidatorReportError("emit-validator-report: 'checks' must be an array");
  }
  return { checks: checksRaw as readonly InputCheck[] };
}

export async function runEmitter(argv: readonly string[]): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`emit-validator-report: ${message}\n`);
    return 1;
  }
  let input: InputShape;
  try {
    if (args.namesFile && args.statusesFile && args.detailsFile) {
      input = await readParallelFiles(args.namesFile, args.statusesFile, args.detailsFile);
    } else {
      const raw = await readChecksBlob(args.input);
      input = parseInputBlob(raw);
    }
  } catch (error) {
    if (error instanceof ValidatorReportError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`emit-validator-report: failed to read input: ${message}\n`);
    return 1;
  }
  const builder = createValidatorReportBuilder();
  for (const check of input.checks) {
    builder.addCheck(check);
  }
  let canonical: string;
  try {
    const built = builder.build();
    // Round-trip through `parseValidatorReport` so the same shape
    // assertions the consumers will apply are checked here at the
    // producer. Catches malformed `status` values, non-string detail,
    // missing names, etc. that `createValidatorReportBuilder` does
    // not validate on `addCheck`.
    const report = parseValidatorReport(built);
    canonical = validatorReportToCanonicalJson(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 2;
  }
  try {
    await writeFile(args.out, canonical, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`emit-validator-report: failed to write ${args.out}: ${message}\n`);
    return 1;
  }
  return 0;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runEmitter(process.argv.slice(2)).then(
    (code) => {
      process.exit(code);
    },
    (error) => {
      process.stderr.write(`emit-validator-report: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
