import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

type LiveStitchArtifactStatus = "blocked" | "generated_live" | "failed";

type PromptSourceKey = "intake" | "prd" | "backlog" | "slicePlan";

const SOURCE_PATH_KEYS: Record<PromptSourceKey, string> = {
  intake: "intakePath",
  prd: "prdPath",
  backlog: "backlogPath",
  slicePlan: "slicePlanPath",
};

const AUTH_ENV_KEYS = ["STITCH_API_KEY", "STITCH_AUTH_TOKEN", "STITCH_LIVE_AUTH_TOKEN"] as const;
const FORBIDDEN_PROVIDER_TOKENS = new Set(["--watch", "watch", "--daemon", "--server", "--mcp", "--output", "-o", ">", "|", "&&", ";"]);

export interface LiveStitchSourcePrompt {
  promptPath: string;
  promptMetadataPath: string;
  promptHash: string;
}

export interface LiveStitchOutputHash {
  path: string;
  sha256: string;
  bytes: number;
}

export interface LiveStitchArtifact {
  version: 1;
  initiativeId: string;
  sliceId: string;
  artifactId: string;
  mode: "live";
  phase: "stitch_generation";
  status: LiveStitchArtifactStatus;
  approvalRef: string | null;
  sourcePrompt: LiveStitchSourcePrompt;
  managedArtifacts: {
    root: string;
    manifestPath: string;
    outputHashes: LiveStitchOutputHash[];
  };
  screens: unknown[];
  constraints: {
    liveStitchCalled: boolean;
    taskPacketsCreated: false;
    queueJobsCreated: false;
    requiresHumanApproval: true;
  };
  nextAllowedPhase: "screen_approval";
  nextBlockedUntil: "human_artifact_review";
}

export interface LiveStitchCommandResult {
  stdout: string;
  stderr: string;
}

export type LiveStitchCommandRunner = (command: string, args: string[], options: { cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv }) => Promise<LiveStitchCommandResult>;

export interface LiveStitchBaseOptions {
  repoRoot?: string;
  initiative: string;
  sliceId: string;
  runId?: string;
  managedRoot?: string;
  providerCommand?: string;
  policyAllowsProviderCommand?: boolean;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

export interface ApplyLiveStitchArtifactOptions extends LiveStitchBaseOptions {
  approvalRef?: string;
  runner?: LiveStitchCommandRunner;
}

export interface PlannedLiveStitchArtifactResult {
  repoRoot: string;
  initiativeId: string;
  sliceId: string;
  summaryJsonPath: string;
  summaryMarkdownPath: string;
  artifact: LiveStitchArtifact;
  markdown: string;
  manifest: LiveStitchManifest;
  plannedCall: { command: string | null; args: string[]; timeoutMs: number };
  requiredConfig: string[];
  createdFiles: string[];
}

export interface AppliedLiveStitchArtifactResult extends PlannedLiveStitchArtifactResult {
  failureMessage?: string;
}

export interface LiveStitchManifest {
  version: 1;
  initiativeId: string;
  sliceId: string;
  runId: string;
  sourcePrompt: LiveStitchSourcePrompt;
  provider: {
    command: string | null;
    args: string[];
    timeoutMs: number;
    auth: { present: boolean; source: "environment" | "missing" };
  };
  outputs: LiveStitchOutputHash[];
  failureMessage?: string;
}

interface PromptMetadata {
  version?: unknown;
  initiativeId?: unknown;
  sliceId?: unknown;
  phase?: unknown;
  promptPath?: unknown;
  promptHash?: unknown;
  sources?: unknown;
  sourceHashes?: unknown;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertInitiativeSlug(value: string): string {
  const trimmed = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) throw new Error(`Invalid initiative slug: ${value}`);
  return trimmed;
}

function assertSliceId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error("--slice is required.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) throw new Error(`Invalid slice id: ${value}`);
  return trimmed;
}

function defaultRunId(): string {
  return `run-${new Date().toISOString().replace(/[^0-9TZ]/g, "")}`;
}

async function readRequired(repoRoot: string, relPath: string, label: string): Promise<string> {
  try {
    return await readFile(join(repoRoot, relPath), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Missing required live Stitch ${label}: ${relPath}`);
    }
    throw error;
  }
}

function normalizeMetadata(value: unknown, expected: { initiativeId: string; sliceId: string }): Required<Pick<PromptMetadata, "promptPath" | "promptHash" | "sources" | "sourceHashes">> {
  if (!isRecord(value)) throw new Error("Invalid live Stitch prompt metadata: expected object.");
  if (value.version !== 1) throw new Error("Invalid live Stitch prompt metadata: version must be 1.");
  if (value.initiativeId !== expected.initiativeId) throw new Error(`Invalid live Stitch prompt metadata: initiativeId must be ${expected.initiativeId}.`);
  if (value.sliceId !== expected.sliceId) throw new Error(`Invalid live Stitch prompt metadata: sliceId must be ${expected.sliceId}.`);
  if (value.phase !== "stitch_prompt") throw new Error("Invalid live Stitch prompt metadata: phase must be stitch_prompt.");
  if (typeof value.promptPath !== "string" || value.promptPath.trim().length === 0) throw new Error("Invalid live Stitch prompt metadata: promptPath is required.");
  if (typeof value.promptHash !== "string" || !/^[a-f0-9]{64}$/.test(value.promptHash)) throw new Error("Invalid live Stitch prompt metadata: promptHash is required.");
  if (!isRecord(value.sources)) throw new Error("Invalid live Stitch prompt metadata: sources is required.");
  if (!isRecord(value.sourceHashes)) throw new Error("Invalid live Stitch prompt metadata: sourceHashes is required.");
  return { promptPath: value.promptPath, promptHash: value.promptHash, sources: value.sources, sourceHashes: value.sourceHashes };
}

async function assertSourceHashesFresh(repoRoot: string, metadata: { sources: unknown; sourceHashes: unknown }): Promise<void> {
  if (!isRecord(metadata.sources) || !isRecord(metadata.sourceHashes)) throw new Error("Invalid live Stitch prompt metadata: sources/sourceHashes are required.");
  for (const key of Object.keys(SOURCE_PATH_KEYS) as PromptSourceKey[]) {
    const pathKey = SOURCE_PATH_KEYS[key];
    const relPath = metadata.sources[pathKey];
    const expectedHash = metadata.sourceHashes[key];
    if (typeof relPath !== "string" || relPath.trim().length === 0) throw new Error(`Invalid live Stitch prompt metadata: sources.${pathKey} is required.`);
    if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error(`Invalid live Stitch prompt metadata: sourceHashes.${key} is required.`);
    const actualHash = sha256(await readRequired(repoRoot, relPath, `source file for ${key}`));
    if (actualHash !== expectedHash) throw new Error(`Stale Stitch prompt source hash for ${key}: expected ${expectedHash}, actual ${actualHash}.`);
  }
}

function assertManagedRoot(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || normalized.includes("..") || !normalized.startsWith(".pi/agent/artifacts/stitch/")) {
    throw new Error("Managed live Stitch artifact root must stay under .pi/agent/artifacts/stitch/.");
  }
  return normalized;
}

function parseProviderCommand(commandValue: string | undefined, policyAllowsProviderCommand: boolean | undefined): { command: string | null; extraArgs: string[] } {
  if (!commandValue || commandValue.trim().length === 0) return { command: null, extraArgs: [] };
  if (!policyAllowsProviderCommand) throw new Error("--provider-command requires explicit policy allowance.");
  const tokens = commandValue.trim().split(/\s+/);
  for (const token of tokens) {
    const normalizedToken = token.trim();
    if (FORBIDDEN_PROVIDER_TOKENS.has(normalizedToken) || normalizedToken.startsWith("--output=") || normalizedToken.startsWith("--watch=") || normalizedToken.startsWith("--daemon=") || normalizedToken.startsWith("--server=") || normalizedToken.startsWith("--mcp=")) {
      throw new Error(`Forbidden live Stitch provider argument: ${token}`);
    }
  }
  const [command, ...extraArgs] = tokens;
  return { command: command ?? null, extraArgs };
}

function authPresent(env: NodeJS.ProcessEnv | Record<string, string | undefined>): boolean {
  return AUTH_ENV_KEYS.some((key) => typeof env[key] === "string" && env[key]!.trim().length > 0);
}

function requiredConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string[] {
  return authPresent(env) ? [] : ["STITCH_API_KEY or STITCH_AUTH_TOKEN or STITCH_LIVE_AUTH_TOKEN"];
}

function sourcePromptFor(initiativeId: string, sliceId: string, promptHash: string): LiveStitchSourcePrompt {
  return {
    promptPath: `docs/initiatives/${initiativeId}/stitch-prompts/${sliceId}.prompt.md`,
    promptMetadataPath: `docs/initiatives/${initiativeId}/stitch-prompts/${sliceId}.prompt.json`,
    promptHash,
  };
}

function plannedArgs(repoRoot: string, promptPath: string, managedRoot: string, extraArgs: string[]): string[] {
  return [...extraArgs, "--prompt", join(repoRoot, promptPath), "--output-dir", join(repoRoot, managedRoot)];
}

function renderLiveStitchArtifactMarkdown(artifact: LiveStitchArtifact): string {
  const lines = [
    `# Live Screen Artifact: ${artifact.initiativeId} / ${artifact.sliceId}`,
    "",
    `- Artifact ID: ${artifact.artifactId}`,
    `- Mode: ${artifact.mode}`,
    `- Status: ${artifact.status}`,
    `- Approval ref: ${artifact.approvalRef ?? "none"}`,
    `- Source prompt: ${artifact.sourcePrompt.promptPath}`,
    `- Source prompt hash: ${artifact.sourcePrompt.promptHash}`,
    `- Managed root: ${artifact.managedArtifacts.root}`,
    `- Manifest: ${artifact.managedArtifacts.manifestPath}`,
    `- Live Stitch called: ${artifact.constraints.liveStitchCalled}`,
    `- Task packets created: ${artifact.constraints.taskPacketsCreated}`,
    `- Queue jobs created: ${artifact.constraints.queueJobsCreated}`,
    `- Requires human approval: ${artifact.constraints.requiresHumanApproval}`,
    `- Next allowed phase: ${artifact.nextAllowedPhase}`,
    `- Next blocked until: ${artifact.nextBlockedUntil}`,
    "",
    "## Output hashes",
    ...(artifact.managedArtifacts.outputHashes.length > 0 ? artifact.managedArtifacts.outputHashes.map((entry) => `- ${entry.path}: ${entry.sha256} (${entry.bytes} bytes)`) : ["- none"]),
  ];
  return `${lines.join("\n")}\n`;
}

async function loadAndValidatePrompt(options: { repoRoot: string; initiativeId: string; sliceId: string }): Promise<LiveStitchSourcePrompt> {
  const promptMetadataPath = `docs/initiatives/${options.initiativeId}/stitch-prompts/${options.sliceId}.prompt.json`;
  const metadataText = await readRequired(options.repoRoot, promptMetadataPath, "prompt metadata");
  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(metadataText);
  } catch (error) {
    throw new Error(`Invalid live Stitch prompt metadata JSON: ${(error as Error).message}`);
  }
  const metadata = normalizeMetadata(rawMetadata, options);
  await assertSourceHashesFresh(options.repoRoot, metadata);
  const expectedPromptPath = `docs/initiatives/${options.initiativeId}/stitch-prompts/${options.sliceId}.prompt.md`;
  if (metadata.promptPath !== expectedPromptPath) throw new Error(`Invalid live Stitch prompt metadata: promptPath must be ${expectedPromptPath}.`);
  const promptHash = sha256(await readRequired(options.repoRoot, metadata.promptPath, "prompt markdown"));
  if (promptHash !== metadata.promptHash) throw new Error(`Stale Stitch prompt hash: expected ${metadata.promptHash}, actual ${promptHash}.`);
  return sourcePromptFor(options.initiativeId, options.sliceId, promptHash);
}

function createArtifact(args: { initiativeId: string; sliceId: string; runId: string; status: LiveStitchArtifactStatus; approvalRef: string | null; sourcePrompt: LiveStitchSourcePrompt; managedRoot: string; outputHashes: LiveStitchOutputHash[]; liveStitchCalled: boolean }): LiveStitchArtifact {
  return {
    version: 1,
    initiativeId: args.initiativeId,
    sliceId: args.sliceId,
    artifactId: `live-screen-${args.sliceId}-${args.runId}`,
    mode: "live",
    phase: "stitch_generation",
    status: args.status,
    approvalRef: args.approvalRef,
    sourcePrompt: args.sourcePrompt,
    managedArtifacts: {
      root: args.managedRoot,
      manifestPath: `${args.managedRoot}/manifest.json`,
      outputHashes: args.outputHashes,
    },
    screens: [],
    constraints: {
      liveStitchCalled: args.liveStitchCalled,
      taskPacketsCreated: false,
      queueJobsCreated: false,
      requiresHumanApproval: true,
    },
    nextAllowedPhase: "screen_approval",
    nextBlockedUntil: "human_artifact_review",
  };
}

export async function planLiveStitchArtifact(options: LiveStitchBaseOptions): Promise<PlannedLiveStitchArtifactResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const initiativeId = assertInitiativeSlug(options.initiative);
  const sliceId = assertSliceId(options.sliceId);
  const runId = options.runId ?? defaultRunId();
  const managedRoot = assertManagedRoot(options.managedRoot ?? `.pi/agent/artifacts/stitch/${initiativeId}/${sliceId}/${runId}`);
  const env = options.env ?? process.env;
  const provider = parseProviderCommand(options.providerCommand ?? env.STITCH_PROVIDER_COMMAND, options.policyAllowsProviderCommand ?? Boolean(env.HARNESS_ALLOW_LIVE_STITCH_PROVIDER_COMMAND));
  const timeoutMs = options.timeoutMs ?? 120_000;
  const sourcePrompt = await loadAndValidatePrompt({ repoRoot, initiativeId, sliceId });
  const callArgs = provider.command ? plannedArgs(repoRoot, sourcePrompt.promptPath, managedRoot, provider.extraArgs) : [];
  const artifact = createArtifact({ initiativeId, sliceId, runId, status: "blocked", approvalRef: null, sourcePrompt, managedRoot, outputHashes: [], liveStitchCalled: false });
  const manifest: LiveStitchManifest = {
    version: 1,
    initiativeId,
    sliceId,
    runId,
    sourcePrompt,
    provider: {
      command: provider.command,
      args: callArgs,
      timeoutMs,
      auth: { present: authPresent(env), source: authPresent(env) ? "environment" : "missing" },
    },
    outputs: [],
  };
  return {
    repoRoot,
    initiativeId,
    sliceId,
    summaryJsonPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.live-screen.json`,
    summaryMarkdownPath: `docs/initiatives/${initiativeId}/screen-artifacts/${sliceId}.live-screen.md`,
    artifact,
    markdown: renderLiveStitchArtifactMarkdown(artifact),
    manifest,
    plannedCall: { command: provider.command, args: callArgs, timeoutMs },
    requiredConfig: requiredConfig(env),
    createdFiles: [],
  };
}

const defaultRunner: LiveStitchCommandRunner = async (command, args, options) => {
  const result = await execFile(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeoutMs,
    env: options.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

function sanitizedFailureMessage(error: unknown, env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  const message = (error as Error).message ?? String(error);
  return AUTH_ENV_KEYS.reduce((current, key) => {
    const values = [process.env[key], env[key]].filter((value): value is string => typeof value === "string" && value.length > 0);
    return values.reduce((redacted, value) => redacted.replaceAll(value, "[redacted]"), current);
  }, message);
}

async function writeManagedOutput(repoRoot: string, managedRoot: string, basename: string, content: string): Promise<LiveStitchOutputHash | null> {
  if (content.length === 0) return null;
  const relPath = `${managedRoot}/${basename}`;
  const absPath = join(repoRoot, relPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
  return { path: relPath, sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8") };
}

export async function applyLiveStitchArtifact(options: ApplyLiveStitchArtifactOptions): Promise<AppliedLiveStitchArtifactResult> {
  if (!options.approvalRef || options.approvalRef.trim().length === 0) throw new Error("--approval-ref is required for live Stitch apply.");
  const planned = await planLiveStitchArtifact(options);
  const env = options.env ?? process.env;
  if (!authPresent(env)) throw new Error("Missing live Stitch auth/config: set STITCH_API_KEY, STITCH_AUTH_TOKEN, or STITCH_LIVE_AUTH_TOKEN in the environment.");
  if (!planned.plannedCall.command) throw new Error("Missing live Stitch provider command/config: set STITCH_PROVIDER_COMMAND or pass --provider-command when policy allows it.");

  await mkdir(join(planned.repoRoot, planned.artifact.managedArtifacts.root), { recursive: true });
  const runner = options.runner ?? defaultRunner;
  const outputHashes: LiveStitchOutputHash[] = [];
  let status: LiveStitchArtifactStatus = "generated_live";
  let failureMessage: string | undefined;
  try {
    const commandResult = await runner(planned.plannedCall.command, planned.plannedCall.args, {
      cwd: planned.repoRoot,
      timeoutMs: planned.plannedCall.timeoutMs,
      env: { ...process.env, ...env },
    });
    const stdoutName = commandResult.stdout.trim().startsWith("{") || commandResult.stdout.trim().startsWith("[") ? "stdout.json" : "stdout.txt";
    const stdoutHash = await writeManagedOutput(planned.repoRoot, planned.artifact.managedArtifacts.root, stdoutName, commandResult.stdout);
    const stderrHash = await writeManagedOutput(planned.repoRoot, planned.artifact.managedArtifacts.root, "stderr.txt", commandResult.stderr);
    if (stdoutHash) outputHashes.push(stdoutHash);
    if (stderrHash) outputHashes.push(stderrHash);
  } catch (error) {
    status = "failed";
    failureMessage = sanitizedFailureMessage(error, env);
  }

  const artifact = createArtifact({
    initiativeId: planned.initiativeId,
    sliceId: planned.sliceId,
    runId: options.runId ?? planned.manifest.runId,
    status,
    approvalRef: options.approvalRef,
    sourcePrompt: planned.artifact.sourcePrompt,
    managedRoot: planned.artifact.managedArtifacts.root,
    outputHashes,
    liveStitchCalled: true,
  });
  const manifest: LiveStitchManifest = {
    ...planned.manifest,
    provider: { ...planned.manifest.provider, auth: { present: true, source: "environment" } },
    outputs: outputHashes,
    ...(failureMessage ? { failureMessage } : {}),
  };
  return {
    ...planned,
    artifact,
    markdown: renderLiveStitchArtifactMarkdown(artifact),
    manifest,
    failureMessage,
  };
}

export async function writeLiveStitchArtifactArtifacts(result: PlannedLiveStitchArtifactResult | AppliedLiveStitchArtifactResult): Promise<string[]> {
  const manifestAbs = join(result.repoRoot, result.artifact.managedArtifacts.manifestPath);
  const jsonAbs = join(result.repoRoot, result.summaryJsonPath);
  const markdownAbs = join(result.repoRoot, result.summaryMarkdownPath);
  await mkdir(dirname(manifestAbs), { recursive: true });
  await mkdir(dirname(jsonAbs), { recursive: true });
  await writeFile(manifestAbs, `${JSON.stringify(result.manifest, null, 2)}\n`, "utf8");
  await writeFile(jsonAbs, `${JSON.stringify(result.artifact, null, 2)}\n`, "utf8");
  await writeFile(markdownAbs, result.markdown, "utf8");
  return [result.artifact.managedArtifacts.manifestPath, result.summaryJsonPath, result.summaryMarkdownPath];
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function liveStitchAdapterExtension(): void {}
