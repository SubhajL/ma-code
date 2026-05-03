import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export type GateCheckState = string;

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;
export type SleepFn = (ms: number) => Promise<void>;

export interface PrGateOptions {
  pr: string;
  intervalSeconds?: number;
  maxAttempts?: number;
  includeComments?: boolean;
}

export interface PrGateCheck {
  name: string;
  state: GateCheckState;
  workflow?: string;
  link?: string;
  description?: string;
}

export interface PrGateAttempt {
  attempt: number;
  status: "pass" | "fail" | "pending";
  checks: PrGateCheck[];
  summary: {
    passCount: number;
    failCount: number;
    pendingCount: number;
    totalCount: number;
  };
}

export interface PrGateCommentSummary {
  totalCommentCount: number;
  benignBotCommentCount: number;
  blockingCommentCount: number;
  blockingComments: Array<{ author: string; body: string; url?: string }>;
}

export interface PrGateReviewSummary {
  reviewDecision: string;
  totalReviewCount: number;
  changesRequestedCount: number;
  blockingReviews: Array<{ author: string; state: string; body?: string }>;
}

export interface PrGateSession {
  pr: string;
  intervalSeconds: number;
  maxAttempts: number;
  attempts: PrGateAttempt[];
  finalStatus: "pass" | "fail" | "pending" | "timeout";
  commentSummary: PrGateCommentSummary;
  reviewSummary: PrGateReviewSummary;
  prContext: {
    number?: number;
    state?: string;
    mergeStateStatus?: string;
    url?: string;
  };
  recommendedNextAction: "merge_or_sync" | "fix_required" | "wait_and_rerun";
  recommendedNextActionReason: string;
}

const PASS_STATES = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
const FAIL_STATES = new Set(["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"]);
const DEFAULT_INTERVAL_SECONDS = 180;
const DEFAULT_MAX_ATTEMPTS = 60;

function normalizeState(state: unknown): string {
  return String(state ?? "UNKNOWN").trim().toUpperCase();
}

function clampIntervalSeconds(value: number | undefined): number {
  if (value === undefined) return DEFAULT_INTERVAL_SECONDS;
  if (!Number.isFinite(value) || value < DEFAULT_INTERVAL_SECONDS) return DEFAULT_INTERVAL_SECONDS;
  return Math.floor(value);
}

function clampMaxAttempts(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_ATTEMPTS;
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.floor(value), 500);
}

export function evaluateChecks(checks: PrGateCheck[]): PrGateAttempt["status"] {
  if (checks.length === 0) return "pending";
  if (checks.some((check) => FAIL_STATES.has(normalizeState(check.state)))) return "fail";
  if (checks.every((check) => PASS_STATES.has(normalizeState(check.state)))) return "pass";
  return "pending";
}

function summarizeChecks(checks: PrGateCheck[]): PrGateAttempt["summary"] {
  let passCount = 0;
  let failCount = 0;
  let pendingCount = 0;
  for (const check of checks) {
    const state = normalizeState(check.state);
    if (PASS_STATES.has(state)) passCount += 1;
    else if (FAIL_STATES.has(state)) failCount += 1;
    else pendingCount += 1;
  }
  return { passCount, failCount, pendingCount, totalCount: checks.length };
}

function normalizeChecks(raw: unknown): PrGateCheck[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    return {
      name: String(record.name ?? "unnamed-check"),
      state: normalizeState(record.state),
      workflow: typeof record.workflow === "string" ? record.workflow : undefined,
      link: typeof record.link === "string" ? record.link : undefined,
      description: typeof record.description === "string" ? record.description : undefined,
    };
  });
}

function loginFromAuthor(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { login?: unknown }).login === "string") return (value as { login: string }).login;
  return "unknown";
}

function isBenignBotComment(author: string, body: string): boolean {
  const lower = body.toLowerCase();
  return (
    author.includes("github-actions") &&
    (lower.includes("dependency-review-pr-comment-marker") || lower.includes("no vulnerabilities") || lower.includes("no vulnerabilities or license issues"))
  );
}

function summarizeComments(raw: unknown): PrGateCommentSummary {
  const comments = Array.isArray(raw) ? raw : [];
  const blockingComments: PrGateCommentSummary["blockingComments"] = [];
  let benignBotCommentCount = 0;
  for (const entry of comments) {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const author = loginFromAuthor(record.author);
    const body = String(record.body ?? "");
    const url = typeof record.url === "string" ? record.url : undefined;
    if (isBenignBotComment(author, body)) {
      benignBotCommentCount += 1;
      continue;
    }
    blockingComments.push({ author, body, url });
  }
  return {
    totalCommentCount: comments.length,
    benignBotCommentCount,
    blockingCommentCount: blockingComments.length,
    blockingComments,
  };
}

function summarizeReviews(rawReviews: unknown, reviewDecision: string): PrGateReviewSummary {
  const reviews = Array.isArray(rawReviews) ? rawReviews : [];
  const blockingReviews: PrGateReviewSummary["blockingReviews"] = [];
  for (const entry of reviews) {
    const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const state = String(record.state ?? "").toUpperCase();
    if (state !== "CHANGES_REQUESTED") continue;
    blockingReviews.push({
      author: loginFromAuthor(record.author),
      state,
      body: typeof record.body === "string" ? record.body : undefined,
    });
  }
  return {
    reviewDecision,
    totalReviewCount: reviews.length,
    changesRequestedCount: blockingReviews.length,
    blockingReviews,
  };
}

async function defaultRunner(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    child.stdin.end();
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runJson(runner: CommandRunner, args: string[]): Promise<unknown> {
  if (args.includes("--watch")) throw new Error("harness-pr-gate must not call gh with --watch.");
  const result = await runner("gh", args);
  if (result.code !== 0) {
    throw new Error(`gh ${args.join(" ")} failed with code ${result.code}: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout || "null");
}

async function readChecks(pr: string, runner: CommandRunner): Promise<PrGateCheck[]> {
  const raw = await runJson(runner, ["pr", "checks", pr, "--json", "name,state,workflow,link,description"]);
  return normalizeChecks(raw);
}

async function readPrContext(pr: string, runner: CommandRunner, includeComments: boolean) {
  const fields = includeComments
    ? "number,state,reviewDecision,reviews,comments,mergeStateStatus,url"
    : "number,state,reviewDecision,reviews,mergeStateStatus,url";
  const raw = await runJson(runner, ["pr", "view", pr, "--json", fields]);
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const reviewDecision = String(record.reviewDecision ?? "");
  return {
    context: {
      number: typeof record.number === "number" ? record.number : undefined,
      state: typeof record.state === "string" ? record.state : undefined,
      mergeStateStatus: typeof record.mergeStateStatus === "string" ? record.mergeStateStatus : undefined,
      url: typeof record.url === "string" ? record.url : undefined,
    },
    commentSummary: includeComments ? summarizeComments(record.comments) : summarizeComments([]),
    reviewSummary: summarizeReviews(record.reviews, reviewDecision),
  };
}

function recommendNextAction(finalStatus: PrGateSession["finalStatus"], comments: PrGateCommentSummary, reviews: PrGateReviewSummary) {
  if (finalStatus === "fail" || comments.blockingCommentCount > 0 || reviews.changesRequestedCount > 0) {
    return {
      recommendedNextAction: "fix_required" as const,
      recommendedNextActionReason: "At least one check failed, non-benign comment exists, or a review requested changes.",
    };
  }
  if (finalStatus === "pass") {
    return {
      recommendedNextAction: "merge_or_sync" as const,
      recommendedNextActionReason: "All CI/security checks are terminal passing and no blocking comments/reviews were detected.",
    };
  }
  return {
    recommendedNextAction: "wait_and_rerun" as const,
    recommendedNextActionReason: "Checks are still pending or the bounded polling limit was reached before terminal success/failure.",
  };
}

export async function buildPrGateSession(
  options: PrGateOptions,
  deps: { runner?: CommandRunner; sleep?: SleepFn } = {},
): Promise<PrGateSession> {
  if (!options.pr) throw new Error("PR number or URL is required via --pr.");
  const runner = deps.runner ?? defaultRunner;
  const sleep = deps.sleep ?? defaultSleep;
  const intervalSeconds = clampIntervalSeconds(options.intervalSeconds);
  const maxAttempts = clampMaxAttempts(options.maxAttempts);
  const attempts: PrGateAttempt[] = [];
  let finalStatus: PrGateSession["finalStatus"] = "timeout";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const checks = await readChecks(options.pr, runner);
    const status = evaluateChecks(checks);
    attempts.push({ attempt, status, checks, summary: summarizeChecks(checks) });
    if (status === "pass" || status === "fail") {
      finalStatus = status;
      break;
    }
    finalStatus = attempt === maxAttempts ? "timeout" : "pending";
    if (attempt < maxAttempts) await sleep(intervalSeconds * 1000);
  }

  const { context, commentSummary, reviewSummary } = await readPrContext(options.pr, runner, options.includeComments !== false);
  const recommendation = recommendNextAction(finalStatus, commentSummary, reviewSummary);
  return {
    pr: options.pr,
    intervalSeconds,
    maxAttempts,
    attempts,
    finalStatus,
    commentSummary,
    reviewSummary,
    prContext: context,
    ...recommendation,
  };
}

function formatChecks(attempt: PrGateAttempt | undefined): string[] {
  if (!attempt) return ["checks: none"];
  return attempt.checks.map((check) => `- ${check.name}: ${normalizeState(check.state)}${check.workflow ? ` (${check.workflow})` : ""}`);
}

export function renderPrGateSession(session: PrGateSession): string {
  const lastAttempt = session.attempts.at(-1);
  const lines = [
    "Harness PR Gate Check",
    `pr: ${session.prContext.url ?? session.pr}`,
    "polling: gh pr checks without --watch",
    `interval seconds: ${session.intervalSeconds}`,
    `attempts: ${session.attempts.length}/${session.maxAttempts}`,
    `final status: ${session.finalStatus}`,
    `latest check summary: pass=${lastAttempt?.summary.passCount ?? 0} fail=${lastAttempt?.summary.failCount ?? 0} pending=${lastAttempt?.summary.pendingCount ?? 0} total=${lastAttempt?.summary.totalCount ?? 0}`,
    "latest checks:",
    ...formatChecks(lastAttempt),
    `review decision: ${session.reviewSummary.reviewDecision || "none"}`,
    `changes requested reviews: ${session.reviewSummary.changesRequestedCount}`,
    `comments: total=${session.commentSummary.totalCommentCount} benign_bot=${session.commentSummary.benignBotCommentCount} blocking=${session.commentSummary.blockingCommentCount}`,
    `recommended next action: ${session.recommendedNextAction}`,
    `next action reason: ${session.recommendedNextActionReason}`,
  ];
  return `${lines.join("\n")}\n`;
}

function printUsage(): void {
  process.stdout.write(`Usage: node --import tsx scripts/harness-pr-gate.ts --pr <number-or-url> [options]\n\nOptions:\n  --pr <value>                 Pull request number or URL to inspect (required)\n  --interval-seconds <n>       Polling interval in seconds (default/minimum: 180)\n  --max-attempts <n>           Bounded polling attempts before timeout (default: 60, max: 500)\n  --once                       Run one check only with no sleep\n  --no-comments                Skip PR comment collection\n  --json                       Emit machine-readable JSON instead of text\n  -h, --help                   Show this help text\n`);
}

function parseArgs(argv: string[]): { options: PrGateOptions; json: boolean; help: boolean } {
  const options: PrGateOptions = { pr: "" };
  let json = false;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--once") {
      options.maxAttempts = 1;
      continue;
    }
    if (arg === "--no-comments") {
      options.includeComments = false;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }
    if (arg === "--pr") {
      const next = argv[index + 1];
      if (!next) throw new Error("--pr requires a value.");
      options.pr = next;
      index += 1;
      continue;
    }
    if (arg === "--interval-seconds") {
      const next = argv[index + 1];
      if (!next) throw new Error("--interval-seconds requires a numeric value.");
      options.intervalSeconds = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (arg === "--max-attempts") {
      const next = argv[index + 1];
      if (!next) throw new Error("--max-attempts requires a numeric value.");
      options.maxAttempts = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (!options.pr && !arg.startsWith("-")) {
      options.pr = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { options, json, help };
}

async function main(): Promise<void> {
  const { options, json, help } = parseArgs(process.argv.slice(2));
  if (help) {
    printUsage();
    return;
  }
  const session = await buildPrGateSession(options);
  if (json) process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
  else process.stdout.write(renderPrGateSession(session));
  if (session.recommendedNextAction === "fix_required") process.exitCode = 1;
  else if (session.finalStatus === "timeout") process.exitCode = 2;
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`harness-pr-gate failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
