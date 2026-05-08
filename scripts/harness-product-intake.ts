import { realpathSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { initHarnessFeature } from "./harness-init-feature.ts";

const RECOMMENDED_NEXT_SKILLS = ["g-grill", "g-prd", "g-issues"] as const;
const NEXT_DISALLOWED_ACTIONS = ["stitch_generation", "task_packet_generation", "queue_dispatch"] as const;
const ARTIFACT_NAMES = ["prd.md", "backlog.md", "decisions.md"] as const;
const ALLOWED_DOMAINS = ["frontend", "backend", "infra", "docs", "research"] as const;

type IntakeStatus = "blocked" | "ready_for_prd";
type IntakeMode = "dry-run" | "apply";
type IntakeDomain = (typeof ALLOWED_DOMAINS)[number];

export interface ProductIntakeArtifacts {
  prdPath: string;
  backlogPath: string;
  decisionsPath: string;
}

export interface ProductIntakeState {
  version: 1;
  initiativeId: string;
  sourceDescription: string;
  intakeTier: "tier3_full_intake";
  status: IntakeStatus;
  recommendedNextSkills: string[];
  blockingQuestions: string[];
  domains: IntakeDomain[];
  createdAt: string;
  artifacts: ProductIntakeArtifacts;
  nextDisallowedActions: string[];
}

export interface ProductIntakeOptions {
  repoRoot?: string;
  slug: string;
  description: string;
  mode: IntakeMode;
  json?: boolean;
  domains?: IntakeDomain[];
  now?: Date;
}

export interface ProductIntakeResult {
  repoRoot: string;
  slug: string;
  mode: IntakeMode;
  status: IntakeStatus;
  plannedFiles: string[];
  createdFiles: string[];
  intake: ProductIntakeState;
}

function normalizeSlug(input: string): string {
  const slug = input.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Invalid product intake slug: ${input}. Use lowercase letters, numbers, and hyphen-separated words.`);
  }
  return slug;
}

function normalizeDescription(input: string): string {
  const description = input.trim();
  if (description.length === 0) {
    throw new Error("--description is required.");
  }
  return description;
}

function normalizeDomains(input: string[] | undefined): IntakeDomain[] {
  const rawValues = (input ?? []).flatMap((entry) => entry.split(",")).map((entry) => entry.trim()).filter(Boolean);
  const domains = [...new Set(rawValues)].filter((value): value is IntakeDomain => (ALLOWED_DOMAINS as readonly string[]).includes(value));
  const invalid = rawValues.filter((value) => !(ALLOWED_DOMAINS as readonly string[]).includes(value));
  if (invalid.length > 0) {
    throw new Error(`Invalid product intake domain(s): ${invalid.join(", ")}. Use one of: ${ALLOWED_DOMAINS.join(", ")}.`);
  }
  return domains;
}

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await stat(pathValue);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function artifactPaths(slug: string): ProductIntakeArtifacts {
  const base = `docs/initiatives/${slug}`;
  return {
    prdPath: `${base}/prd.md`,
    backlogPath: `${base}/backlog.md`,
    decisionsPath: `${base}/decisions.md`,
  };
}

async function plannedFilesFor(repoRoot: string, slug: string, status: IntakeStatus, explicitDomains: IntakeDomain[]): Promise<string[]> {
  const base = `docs/initiatives/${slug}`;
  if (status === "blocked") return [`${base}/intake.json`];

  const planned = [...ARTIFACT_NAMES.map((name) => `${base}/${name}`)];
  for (const domain of explicitDomains) {
    if (domain !== "frontend" && domain !== "backend") continue;
    const domainDoc = `docs/${domain}/README.md`;
    if (!(await pathExists(join(repoRoot, domainDoc)))) planned.push(domainDoc);
  }
  planned.push(`${base}/intake.json`);
  return planned;
}

function inferDomains(description: string, explicitDomains: IntakeDomain[] | undefined): IntakeDomain[] {
  if (explicitDomains && explicitDomains.length > 0) return explicitDomains;
  const lower = description.toLowerCase();
  const domains: IntakeDomain[] = [];
  if (/\b(ui|ux|screen|page|frontend|front-end|checkout|cart|shopper|visual|form|design|redesign)\b/.test(lower)) {
    domains.push("frontend");
  }
  if (/\b(api|backend|back-end|database|db|service|auth|authorization|payment|payments|order|orders|webhook|data)\b/.test(lower)) {
    domains.push("backend");
  }
  if (/\b(infra|deployment|ci|pipeline|terraform|kubernetes|network)\b/.test(lower)) {
    domains.push("infra");
  }
  if (/\b(documentation|docs|runbook|manual)\b/.test(lower)) {
    domains.push("docs");
  }
  if (/\b(research|investigate|survey|benchmark)\b/.test(lower)) {
    domains.push("research");
  }
  return domains;
}

function assessDescription(description: string): { status: IntakeStatus; blockingQuestions: string[] } {
  const lower = description.toLowerCase().replace(/\s+/g, " ").trim();
  const words = lower.split(/\s+/).filter(Boolean);
  const vaguePhrases = new Set(["make it better", "improve it", "new feature", "fix checkout", "checkout", "redesign checkout"]);
  const hasOutcomeVerb = /\b(so|because|for|allow|enable|reduce|increase|prevent|recover|support|choose|review|place|create|update|replace)\b/.test(lower);
  const hasActorOrObject = /\b(user|users|operator|operators|customer|customers|shopper|shoppers|admin|admins|team|teams|order|orders|payment|payments|cart|checkout)\b/.test(lower);

  if (description.length >= 80 && words.length >= 12 && hasOutcomeVerb && hasActorOrObject && !vaguePhrases.has(lower)) {
    return { status: "ready_for_prd", blockingQuestions: [] };
  }

  const questions = [
    "Who is the target user or actor for this product work?",
    "What problem or outcome should this initiative solve?",
    "What acceptance signal would show the intake is ready for PRD and backlog slicing?",
  ];
  return { status: "blocked", blockingQuestions: questions };
}

async function assertReadyTemplates(repoRoot: string): Promise<void> {
  const templateDir = join(repoRoot, "docs", "initiatives", "TEMPLATE");
  const missingTemplates: string[] = [];
  for (const templateName of ARTIFACT_NAMES) {
    if (!(await pathExists(join(templateDir, templateName)))) missingTemplates.push(templateName);
  }
  if (missingTemplates.length > 0) {
    throw new Error(`Missing required initiative template(s): ${missingTemplates.join(", ")}`);
  }
}

export function buildProductIntakeState(options: {
  slug: string;
  description: string;
  status: IntakeStatus;
  blockingQuestions: string[];
  domains: IntakeDomain[];
  now?: Date;
}): ProductIntakeState {
  return {
    version: 1,
    initiativeId: options.slug,
    sourceDescription: options.description,
    intakeTier: "tier3_full_intake",
    status: options.status,
    recommendedNextSkills: [...RECOMMENDED_NEXT_SKILLS],
    blockingQuestions: options.blockingQuestions,
    domains: options.domains,
    createdAt: (options.now ?? new Date()).toISOString(),
    artifacts: artifactPaths(options.slug),
    nextDisallowedActions: [...NEXT_DISALLOWED_ACTIONS],
  };
}

async function assertNoExistingInitiative(repoRoot: string, slug: string): Promise<void> {
  const targetDir = join(repoRoot, "docs", "initiatives", slug);
  if (await pathExists(targetDir)) {
    throw new Error(`Initiative folder already exists: ${relative(repoRoot, targetDir)}`);
  }
}

async function writeBlockedIntake(repoRoot: string, slug: string, intake: ProductIntakeState): Promise<string[]> {
  const targetDir = join(repoRoot, "docs", "initiatives", slug);
  await mkdir(dirname(targetDir), { recursive: true });
  await mkdir(targetDir, { recursive: false });
  const intakePath = join(targetDir, "intake.json");
  await writeFile(intakePath, `${JSON.stringify(intake, null, 2)}\n`, "utf8");
  return [relative(repoRoot, intakePath)];
}

export async function runProductIntake(options: ProductIntakeOptions): Promise<ProductIntakeResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const slug = normalizeSlug(options.slug);
  const description = normalizeDescription(options.description);
  const explicitDomains = options.domains ?? [];
  const domains = inferDomains(description, explicitDomains);
  const assessment = assessDescription(description);
  const intake = buildProductIntakeState({
    slug,
    description,
    status: assessment.status,
    blockingQuestions: assessment.blockingQuestions,
    domains,
    now: options.now,
  });

  await assertNoExistingInitiative(repoRoot, slug);
  const plannedFiles = await plannedFilesFor(repoRoot, slug, assessment.status, explicitDomains);
  if (assessment.status === "ready_for_prd") {
    await assertReadyTemplates(repoRoot);
  }

  if (options.mode === "dry-run") {
    return { repoRoot, slug, mode: options.mode, status: assessment.status, plannedFiles, createdFiles: [], intake };
  }

  if (assessment.status === "blocked") {
    const createdFiles = await writeBlockedIntake(repoRoot, slug, intake);
    return { repoRoot, slug, mode: options.mode, status: assessment.status, plannedFiles, createdFiles, intake };
  }

  const initResult = await initHarnessFeature({ repoRoot, slug, domains: explicitDomains });
  const intakePath = join(repoRoot, "docs", "initiatives", slug, "intake.json");
  await writeFile(intakePath, `${JSON.stringify(intake, null, 2)}\n`, "utf8");
  return {
    repoRoot,
    slug,
    mode: options.mode,
    status: assessment.status,
    plannedFiles,
    createdFiles: [...initResult.createdFiles, relative(repoRoot, intakePath)],
    intake,
  };
}

function renderResult(result: ProductIntakeResult): string {
  const lines = [
    "Harness Product Intake",
    `repo root: ${result.repoRoot}`,
    `slug: ${result.slug}`,
    `mode: ${result.mode}`,
    `status: ${result.status}`,
    "planned files:",
    ...result.plannedFiles.map((file) => `- ${file}`),
  ];

  if (result.createdFiles.length > 0) {
    lines.push("created files:", ...result.createdFiles.map((file) => `- ${file}`));
  }
  if (result.status === "blocked") {
    lines.push("blocking questions:", ...result.intake.blockingQuestions.map((question) => `- ${question}`), "recommended next step:", "- /skill:g-grill");
  } else {
    lines.push("recommended next steps:", "- /skill:g-prd", "- /skill:g-issues");
  }
  lines.push("phase 1 disallowed actions:", ...NEXT_DISALLOWED_ACTIONS.map((action) => `- ${action}`));
  return `${lines.join("\n")}\n`;
}

function printUsage(): void {
  process.stdout.write(
    "Usage: node --import tsx scripts/harness-product-intake.ts --slug <feature-slug> --description <text> (--dry-run|--apply) [--domains <frontend,backend,infra,docs,research>] [--json]\n",
  );
}

function parseArgs(argv: string[]): ProductIntakeOptions & { help: boolean } {
  let slug = "";
  let description = "";
  let dryRun = false;
  let apply = false;
  let json = false;
  let help = false;
  const domains: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--slug") {
      slug = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--description") {
      description = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--domains") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--domains requires a value.");
      domains.push(value);
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (help) return { slug, description, mode: "dry-run", json, help, domains: normalizeDomains(domains) };
  if (slug.trim().length === 0) throw new Error("--slug is required.");
  if (description.trim().length === 0) throw new Error("--description is required.");
  if (dryRun === apply) throw new Error("Choose exactly one of --dry-run or --apply.");
  return { slug, description, mode: dryRun ? "dry-run" : "apply", json, help, domains: normalizeDomains(domains) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  const result = await runProductIntake(args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(renderResult(result));
  }
}

const isMain = process.argv[1]
  ? (() => {
      try {
        return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
      } catch {
        return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
      }
    })()
  : false;

if (isMain) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`harness-product-intake failed: ${message}\n`);
    process.exit(1);
  });
}
