import { realpathSync } from "node:fs";
import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_TEMPLATES = ["prd.md", "backlog.md", "decisions.md"] as const;
const DOMAIN_DOC_TEMPLATES = {
  frontend: ".pi/agent/package/templates/docs/frontend/README.template.md",
  backend: ".pi/agent/package/templates/docs/backend/README.template.md",
} as const;
const ALLOWED_DOMAINS = ["frontend", "backend", "infra", "docs", "research"] as const;
type FeatureDomain = (typeof ALLOWED_DOMAINS)[number];
const RECOMMENDED_SKILLS = ["g-grill", "g-prd", "g-issues"] as const;

export interface HarnessInitFeatureOptions {
  repoRoot?: string;
  slug: string;
  json?: boolean;
  domains?: FeatureDomain[];
}

export interface HarnessInitFeatureResult {
  repoRoot: string;
  slug: string;
  templateDir: string;
  targetDir: string;
  createdFiles: string[];
  recommendedSkills: string[];
  domains: FeatureDomain[];
}

function normalizeDomains(input: string[] | undefined): FeatureDomain[] {
  const rawValues = (input ?? []).flatMap((entry) => entry.split(",")).map((entry) => entry.trim()).filter(Boolean);
  const domains = [...new Set(rawValues)].filter((value): value is FeatureDomain => (ALLOWED_DOMAINS as readonly string[]).includes(value));
  const invalid = rawValues.filter((value) => !(ALLOWED_DOMAINS as readonly string[]).includes(value));
  if (invalid.length > 0) {
    throw new Error(`Invalid feature domain(s): ${invalid.join(", ")}. Use one of: ${ALLOWED_DOMAINS.join(", ")}.`);
  }
  return domains;
}

function normalizeSlug(input: string): string {
  const slug = input.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Invalid feature slug: ${input}. Use lowercase letters, numbers, and hyphen-separated words.`);
  }
  return slug;
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

function renderResult(result: HarnessInitFeatureResult): string {
  const lines = [
    "Harness Feature Initialized",
    `repo root: ${result.repoRoot}`,
    `slug: ${result.slug}`,
    `target: ${relative(result.repoRoot, result.targetDir)}`,
    `domains: ${result.domains.length > 0 ? result.domains.join(", ") : "none"}`,
    "created files:",
    ...result.createdFiles.map((file) => `- ${file}`),
    "recommended next steps:",
    "- /skill:g-grill — clarify goals if the feature is still fuzzy",
    "- /skill:g-prd — write the bounded PRD for this feature",
    "- /skill:g-issues — slice the approved PRD into vertical backlog items",
  ];
  return `${lines.join("\n")}\n`;
}

export async function initHarnessFeature(options: HarnessInitFeatureOptions): Promise<HarnessInitFeatureResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const slug = normalizeSlug(options.slug);
  const templateDir = join(repoRoot, "docs", "initiatives", "TEMPLATE");
  const targetDir = join(repoRoot, "docs", "initiatives", slug);
  const domains = normalizeDomains(options.domains);

  const missingTemplates: string[] = [];
  for (const templateName of REQUIRED_TEMPLATES) {
    if (!(await pathExists(join(templateDir, templateName)))) {
      missingTemplates.push(templateName);
    }
  }
  if (missingTemplates.length > 0) {
    throw new Error(`Missing required initiative template(s): ${missingTemplates.join(", ")}`);
  }

  if (await pathExists(targetDir)) {
    throw new Error(`Initiative folder already exists: ${relative(repoRoot, targetDir)}`);
  }

  await mkdir(dirname(targetDir), { recursive: true });
  await mkdir(targetDir, { recursive: false });

  const createdFiles: string[] = [];
  for (const templateName of REQUIRED_TEMPLATES) {
    const destination = join(targetDir, templateName);
    await cp(join(templateDir, templateName), destination, { recursive: false });
    createdFiles.push(relative(repoRoot, destination));
  }

  for (const domain of ["frontend", "backend"] as const) {
    if (!domains.includes(domain)) continue;
    const destination = join(repoRoot, "docs", domain, "README.md");
    if (await pathExists(destination)) continue;
    const repoTemplate = join(repoRoot, DOMAIN_DOC_TEMPLATES[domain]);
    const sourceTemplate = (await pathExists(repoTemplate))
      ? repoTemplate
      : join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), DOMAIN_DOC_TEMPLATES[domain]);
    await mkdir(dirname(destination), { recursive: true });
    await cp(sourceTemplate, destination, { recursive: false });
    createdFiles.push(relative(repoRoot, destination));
  }

  return {
    repoRoot,
    slug,
    templateDir: relative(repoRoot, templateDir),
    targetDir,
    createdFiles,
    recommendedSkills: [...RECOMMENDED_SKILLS],
    domains,
  };
}

function printUsage(): void {
  process.stdout.write(
    "Usage: node --import tsx scripts/harness-init-feature.ts --slug <feature-slug> [--domains <frontend,backend,infra,docs,research>] [--json]\n",
  );
}

function parseArgs(argv: string[]): HarnessInitFeatureOptions & { help: boolean } {
  let slug = "";
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
    if (arg === "--domains") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--domains requires a value.");
      }
      domains.push(value);
      index += 1;
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

  if (!help && slug.trim().length === 0) {
    throw new Error("--slug is required.");
  }

  return { slug, json, help, domains: normalizeDomains(domains) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  const result = await initHarnessFeature(args);
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
    process.stderr.write(`harness-init-feature failed: ${message}\n`);
    process.exit(1);
  });
}
