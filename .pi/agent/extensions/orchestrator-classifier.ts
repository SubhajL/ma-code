export type OrchestratorSelectedPath =
  | "product_feature"
  | "ui_slice"
  | "issue_materialization"
  | "product_pipeline"
  | "afk_queue"
  | "worker_job"
  | "pr_lifecycle"
  | "merge"
  | "status"
  | "clarification";

export type OrchestratorConfidence = "high" | "medium" | "low";

export interface OrchestratorInitiativeCandidate {
  slug: string;
  hasPipeline?: boolean;
  hasIssues?: boolean;
  hasSlices?: boolean;
}

export interface OrchestratorGitState {
  branch: string;
  dirty: boolean;
}

export interface OrchestratorClassificationInput {
  goal: string;
  packageScripts: string[];
  initiativeCandidates?: OrchestratorInitiativeCandidate[];
  git?: OrchestratorGitState;
}

export interface OrchestratorInspectedState {
  branch: string;
  dirty: boolean;
  packageScripts: string[];
  initiativeCandidates: OrchestratorInitiativeCandidate[];
}

export interface OrchestratorClassification {
  version: 1;
  mode: "classify";
  goal: string;
  selectedPath: OrchestratorSelectedPath;
  confidence: OrchestratorConfidence;
  requiredArtifacts: string[];
  hitlGates: string[];
  blockedReasons: string[];
  nextDryRunCommand: string | null;
  inspected: OrchestratorInspectedState;
  reasoning: string[];
}

const GENERIC_SLUG_WORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "build",
  "create",
  "feature",
  "flow",
  "for",
  "implement",
  "make",
  "new",
  "please",
  "the",
  "to",
]);

function normalizeGoal(goal: string): string {
  return goal.trim().replace(/\s+/g, " ");
}

function hasScript(packageScripts: string[], script: string): boolean {
  return packageScripts.includes(script);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function compactSlugText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function slugFromGoal(goal: string): string {
  const words = compactSlugText(normalizeGoal(goal))
    .split(/\s+/)
    .filter((word) => word && !GENERIC_SLUG_WORDS.has(word));
  const slugWords = words.slice(0, 3);
  return slugWords.length > 0 ? slugWords.join("-") : "new-initiative";
}

function slugMentioned(goalText: string, slug: string): boolean {
  const compactSlug = compactSlugText(slug);
  const compactHyphenless = compactSlug.replace(/\s+/g, " ");
  return goalText.includes(compactHyphenless);
}

function findInitiative(goalText: string, candidates: OrchestratorInitiativeCandidate[]): OrchestratorInitiativeCandidate | null {
  return candidates.find((candidate) => slugMentioned(goalText, candidate.slug)) ?? null;
}

function extractSliceId(goal: string): string | null {
  return goal.match(/\b(issue-\d+|slice-\d+)\b/i)?.[1].toLowerCase() ?? null;
}

function extractQueueJobId(goal: string): string | null {
  return goal.match(/\b(?:job|queue job|queue-job)\s+([a-z0-9][a-z0-9._-]*)\b/i)?.[1] ?? null;
}

function extractWorkerRunId(goal: string): string | null {
  return goal.match(/\b(?:worker run|worker-run|run)\s+([a-z][a-z0-9._-]*-\d+|wr-[a-z0-9._-]+)\b/i)?.[1] ?? null;
}

function setMissingScript(result: OrchestratorClassification, script: string): void {
  result.nextDryRunCommand = null;
  result.blockedReasons.push(`Missing package script: ${script}`);
}

function selectPath(input: OrchestratorClassificationInput, path: OrchestratorSelectedPath, confidence: OrchestratorConfidence, commandScript: string, command: string, reasoning: string[]): OrchestratorClassification {
  const result = baseResult(input);
  result.selectedPath = path;
  result.confidence = confidence;
  if (hasScript(input.packageScripts, commandScript)) result.nextDryRunCommand = command;
  else setMissingScript(result, commandScript);
  result.reasoning.push(...reasoning);
  return result;
}

function baseResult(input: OrchestratorClassificationInput): OrchestratorClassification {
  return {
    version: 1,
    mode: "classify",
    goal: normalizeGoal(input.goal),
    selectedPath: "clarification",
    confidence: "low",
    requiredArtifacts: [],
    hitlGates: [],
    blockedReasons: [],
    nextDryRunCommand: null,
    inspected: {
      branch: input.git?.branch ?? "unknown",
      dirty: input.git?.dirty ?? false,
      packageScripts: [...input.packageScripts].sort(),
      initiativeCandidates: [...(input.initiativeCandidates ?? [])].sort((left, right) => left.slug.localeCompare(right.slug)),
    },
    reasoning: [],
  };
}

export function classifyOrchestratorGoal(input: OrchestratorClassificationInput): OrchestratorClassification {
  const normalizedGoal = normalizeGoal(input.goal);
  const lower = normalizedGoal.toLowerCase();
  const goalText = compactSlugText(normalizedGoal);
  const candidates = input.initiativeCandidates ?? [];
  const initiative = findInitiative(goalText, candidates);
  const initiativeSlug = initiative?.slug ?? "<initiative-slug>";

  if (!normalizedGoal || /^(help|what now|next|do it|continue|fix it|make it better)$/i.test(normalizedGoal)) {
    const result = baseResult(input);
    result.reasoning.push("Goal is too vague for a safe deterministic path selection.");
    result.blockedReasons.push("Clarify the intended harness path or product outcome.");
    return result;
  }

  if (/\b(status|state|what is running|queue state|show queue)\b/.test(lower)) {
    return selectPath(input, "status", "high", "harness:operator", "npm run harness:operator -- status --json", ["Goal asks for read-only harness status."]);
  }

  if (/\b(merge|land)\b/.test(lower)) {
    const pr = lower.match(/(?:pr\s*#?|#)(\d+)\b/)?.[1] ?? "<pr-number>";
    const result = selectPath(input, "merge", pr === "<pr-number>" ? "medium" : "high", "harness:merge", `npm run harness:merge -- check --pr ${pr} --json`, [
      "Goal asks for merge readiness, so only the merge check path is recommended.",
    ]);
    if (pr === "<pr-number>") result.requiredArtifacts.push("pr-number");
    return result;
  }

  if (/\b(pr|pull request)\b/.test(lower)) {
    const workerRunId = extractWorkerRunId(normalizedGoal) ?? "<worker-run-id>";
    const result = selectPath(
      input,
      "pr_lifecycle",
      workerRunId === "<worker-run-id>" || initiativeSlug === "<initiative-slug>" ? "medium" : "high",
      "harness:pr-lifecycle",
      `npm run harness:pr-lifecycle -- dry-run --initiative ${initiativeSlug} --worker-run-id ${workerRunId} --json`,
      ["Goal asks for PR lifecycle work; Phase 1 recommends only the dry-run command."],
    );
    if (initiativeSlug === "<initiative-slug>") result.requiredArtifacts.push("initiative-slug");
    if (workerRunId === "<worker-run-id>") result.requiredArtifacts.push("worker-run-id");
    return result;
  }

  if (/\b(worker|execute)\b/.test(lower) && /\b(job|queue)\b/.test(lower)) {
    const jobId = extractQueueJobId(normalizedGoal) ?? "<queue-job-id>";
    const result = selectPath(
      input,
      "worker_job",
      jobId === "<queue-job-id>" || initiativeSlug === "<initiative-slug>" ? "medium" : "high",
      "harness:worker-execute",
      `npm run harness:worker-execute -- dry-run --initiative ${initiativeSlug} --job-id ${jobId} --json`,
      ["Goal names a queue job or worker execution path; Phase 1 recommends worker dry-run only."],
    );
    if (initiativeSlug === "<initiative-slug>") result.requiredArtifacts.push("initiative-slug");
    if (jobId === "<queue-job-id>") result.requiredArtifacts.push("queue-job-id");
    return result;
  }

  if (/\b(afk|queue)\b/.test(lower) && /\b(issue|issues|jobs?)\b/.test(lower)) {
    const result = selectPath(
      input,
      "afk_queue",
      initiativeSlug === "<initiative-slug>" ? "medium" : "high",
      "harness:afk-orchestrate",
      `npm run harness:afk-orchestrate -- dry-run --initiative ${initiativeSlug} --json`,
      ["Goal asks to queue AFK-ready issues; Phase 1 recommends AFK dry-run only."],
    );
    if (initiativeSlug === "<initiative-slug>") result.requiredArtifacts.push("initiative-slug");
    return result;
  }

  if (/\b(materialize|g-issues|backlog|approved issues)\b/.test(lower)) {
    const result = selectPath(
      input,
      "issue_materialization",
      "medium",
      "harness:issue-materialize",
      "npm run harness:issue-materialize -- dry-run --source <approved-g-issues.json> --json",
      ["Goal asks to materialize an approved issue artifact; Phase 1 recommends the dry-run path and requires the source file."],
    );
    result.requiredArtifacts.push("approved-g-issues.json");
    return result;
  }

  if (/\b(ui|screen|stitch|slice)\b/.test(lower) && initiative) {
    const sliceId = extractSliceId(normalizedGoal) ?? "<slice-id>";
    const result = selectPath(
      input,
      "ui_slice",
      sliceId === "<slice-id>" ? "medium" : "high",
      "harness:stitch-prompt",
      `npm run harness:stitch-prompt -- --initiative ${initiative.slug} --slice ${sliceId} --dry-run --json`,
      ["Goal appears to target a UI-facing slice for an existing initiative."],
    );
    if (sliceId === "<slice-id>") result.requiredArtifacts.push("slice-id");
    return result;
  }

  if (/\b(pipeline|continue|next step|advance)\b/.test(lower) && initiative?.hasPipeline) {
    return selectPath(
      input,
      "product_pipeline",
      "high",
      "harness:product-pipeline",
      `npm run harness:product-pipeline -- dry-run --initiative ${initiative.slug} --json`,
      ["Goal references an existing initiative pipeline artifact."],
    );
  }

  const slug = slugFromGoal(normalizedGoal);
  const result = selectPath(
    input,
    "product_feature",
    "high",
    "harness:product-intake",
    `npm run harness:product-intake -- --slug ${slug} --description ${shellQuote(normalizedGoal)} --dry-run --json`,
    ["No existing initiative artifact matched the goal.", "Goal appears to describe a new product feature."],
  );
  return result;
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function orchestratorClassifierExtension(): void {}
