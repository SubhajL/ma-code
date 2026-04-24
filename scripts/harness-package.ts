import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MANIFEST_PATH = ".pi/agent/package/harness-package.json";

export interface GeneratedFileRule {
  target: string;
  template: string;
  mode: "create_if_missing";
  requiredReview: boolean;
  notes: string[];
}

export interface HarnessPackageManifest {
  version: 1;
  packageName: string;
  packageVersion: string;
  notes: string[];
  reusableAssets: string[];
  generatedFiles: GeneratedFileRule[];
  packageJsonTemplate: string;
  versionRecordTarget: string;
  excludedPaths: string[];
}

export interface HarnessPackageBootstrapOptions {
  sourceRoot?: string;
  destinationRoot: string;
}

export interface HarnessPackageBootstrapResult {
  version: 1;
  packageName: string;
  packageVersion: string;
  sourceRoot: string;
  destinationRoot: string;
  copiedAssets: string[];
  generatedFiles: string[];
  mergedPackageJson: boolean;
  preservedFiles: string[];
  warnings: string[];
  versionRecordPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return value.map((entry) => entry.trim());
}

function normalizeRelPath(pathValue: string): string {
  return pathValue.replace(/\\/g, "/").replace(/^\.\//, "");
}

function containsPathSegment(pathValue: string, segment: string): boolean {
  return normalizeRelPath(pathValue).split("/").includes(segment);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function parseHarnessPackageManifest(input: unknown): HarnessPackageManifest {
  if (!isRecord(input)) throw new Error("Harness package manifest must be an object.");
  if (input.version !== 1) throw new Error("Harness package manifest version must be 1.");

  const reusableAssets = assertStringArray(input.reusableAssets, "reusableAssets");
  const generatedFilesRaw = input.generatedFiles;
  if (!Array.isArray(generatedFilesRaw) || generatedFilesRaw.length === 0) {
    throw new Error("generatedFiles must be a non-empty array.");
  }

  const generatedFiles = generatedFilesRaw.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`generatedFiles[${index}] must be an object.`);
    if (entry.mode !== "create_if_missing") {
      throw new Error(`generatedFiles[${index}].mode must be create_if_missing.`);
    }
    return {
      target: normalizeRelPath(assertString(entry.target, `generatedFiles[${index}].target`)),
      template: normalizeRelPath(assertString(entry.template, `generatedFiles[${index}].template`)),
      mode: "create_if_missing" as const,
      requiredReview: Boolean(entry.requiredReview),
      notes: Array.isArray(entry.notes) ? entry.notes.filter((value): value is string => typeof value === "string") : [],
    };
  });

  return {
    version: 1,
    packageName: assertString(input.packageName, "packageName"),
    packageVersion: assertString(input.packageVersion, "packageVersion"),
    notes: Array.isArray(input.notes) ? input.notes.filter((value): value is string => typeof value === "string") : [],
    reusableAssets: reusableAssets.map(normalizeRelPath),
    generatedFiles,
    packageJsonTemplate: normalizeRelPath(assertString(input.packageJsonTemplate, "packageJsonTemplate")),
    versionRecordTarget: normalizeRelPath(assertString(input.versionRecordTarget, "versionRecordTarget")),
    excludedPaths: assertStringArray(input.excludedPaths, "excludedPaths").map(normalizeRelPath),
  };
}

export async function loadHarnessPackageManifest(sourceRoot: string = process.cwd()): Promise<HarnessPackageManifest> {
  const manifestAbsolute = resolve(sourceRoot, MANIFEST_PATH);
  const raw = JSON.parse(await readFile(manifestAbsolute, "utf8")) as unknown;
  return parseHarnessPackageManifest(raw);
}

async function ensurePathAbsentOrDirectory(pathValue: string): Promise<void> {
  try {
    const pathStat = await stat(pathValue);
    if (!pathStat.isDirectory()) {
      throw new Error(`Destination path exists and is not a directory: ${pathValue}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(pathValue, { recursive: true });
  }
}

async function ensureParent(pathValue: string): Promise<void> {
  await mkdir(dirname(pathValue), { recursive: true });
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

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function shouldExclude(manifest: HarnessPackageManifest, relPath: string): boolean {
  const normalized = normalizeRelPath(relPath);
  return manifest.excludedPaths.some((excluded) => {
    if (excluded.endsWith("/*")) {
      return normalized.startsWith(excluded.slice(0, -1));
    }
    if (excluded.includes("*")) {
      const pattern = new RegExp(`^${excluded.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
      return pattern.test(normalized);
    }
    return normalized === excluded || normalized.startsWith(`${excluded}/`);
  });
}

async function copyFileIfAbsent(source: string, destination: string): Promise<boolean> {
  if (await pathExists(destination)) {
    return false;
  }
  await ensureParent(destination);
  await cp(source, destination, { recursive: false });
  return true;
}

async function copyAsset(sourceRoot: string, destinationRoot: string, manifest: HarnessPackageManifest, asset: string): Promise<string[]> {
  const sourceAbsolute = resolve(sourceRoot, asset);
  const destinationAbsolute = resolve(destinationRoot, asset);
  const sourceStat = await stat(sourceAbsolute);
  const copied: string[] = [];

  if (sourceStat.isFile()) {
    if (shouldExclude(manifest, asset)) return copied;
    const didCopy = await copyFileIfAbsent(sourceAbsolute, destinationAbsolute);
    if (!didCopy) throw new Error(`Destination already contains managed file: ${asset}`);
    copied.push(asset);
    return copied;
  }

  await ensurePathAbsentOrDirectory(destinationAbsolute);
  for (const file of await collectFiles(sourceAbsolute)) {
    const relPath = normalizeRelPath(relative(sourceRoot, file));
    if (shouldExclude(manifest, relPath)) continue;
    const destinationFile = resolve(destinationRoot, relPath);
    const didCopy = await copyFileIfAbsent(file, destinationFile);
    if (!didCopy) throw new Error(`Destination already contains managed file: ${relPath}`);
    copied.push(relPath);
  }
  return copied;
}

async function generateRepoLocalFiles(
  sourceRoot: string,
  destinationRoot: string,
  manifest: HarnessPackageManifest,
): Promise<{ generatedFiles: string[]; preservedFiles: string[]; warnings: string[] }> {
  const generatedFiles: string[] = [];
  const preservedFiles: string[] = [];
  const warnings: string[] = [];

  for (const rule of manifest.generatedFiles) {
    const destination = resolve(destinationRoot, rule.target);
    if (await pathExists(destination)) {
      preservedFiles.push(rule.target);
      warnings.push(`Preserved existing repo-local file: ${rule.target}`);
      continue;
    }

    const templateAbsolute = resolve(sourceRoot, rule.template);
    await ensureParent(destination);
    await cp(templateAbsolute, destination, { recursive: false });
    generatedFiles.push(rule.target);
    if (rule.requiredReview) {
      warnings.push(`Review generated file before use: ${rule.target}`);
    }
  }

  return { generatedFiles, preservedFiles, warnings };
}

function mergeUniqueStringMap(base: Record<string, string>, addition: Record<string, string>, warnings: string[], label: string): Record<string, string> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(addition)) {
    if (!(key in merged)) {
      merged[key] = value;
      continue;
    }
    if (merged[key] !== value) {
      warnings.push(`Preserved existing ${label} entry for ${key}; package template value was not applied.`);
    }
  }
  return merged;
}

async function mergePackageJson(sourceRoot: string, destinationRoot: string, manifest: HarnessPackageManifest): Promise<{ merged: boolean; warnings: string[] }> {
  const templateAbsolute = resolve(sourceRoot, manifest.packageJsonTemplate);
  const template = JSON.parse(await readFile(templateAbsolute, "utf8")) as Record<string, unknown>;
  const destination = resolve(destinationRoot, "package.json");
  const warnings: string[] = [];

  let output: Record<string, unknown>;
  if (await pathExists(destination)) {
    const existing = JSON.parse(await readFile(destination, "utf8")) as Record<string, unknown>;
    output = { ...existing };
    const existingScripts = isRecord(existing.scripts) ? (existing.scripts as Record<string, string>) : {};
    const templateScripts = isRecord(template.scripts) ? (template.scripts as Record<string, string>) : {};
    output.scripts = mergeUniqueStringMap(existingScripts, templateScripts, warnings, "package.json script");

    const existingDeps = isRecord(existing.devDependencies) ? (existing.devDependencies as Record<string, string>) : {};
    const templateDeps = isRecord(template.devDependencies) ? (template.devDependencies as Record<string, string>) : {};
    output.devDependencies = mergeUniqueStringMap(existingDeps, templateDeps, warnings, "package.json devDependency");

    if (!("type" in output) && typeof template.type === "string") output.type = template.type;
    if (!("private" in output) && typeof template.private === "boolean") output.private = template.private;
  } else {
    output = {
      name: basename(destinationRoot) || template.name || "repo-local-pi-harness-dev",
      private: typeof template.private === "boolean" ? template.private : true,
      type: template.type ?? "module",
      scripts: template.scripts ?? {},
      devDependencies: template.devDependencies ?? {},
    };
  }

  await writeFile(destination, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  return { merged: true, warnings };
}

async function writeVersionRecord(
  sourceRoot: string,
  destinationRoot: string,
  manifest: HarnessPackageManifest,
  result: HarnessPackageBootstrapResult,
): Promise<string> {
  const versionRecordPath = resolve(destinationRoot, manifest.versionRecordTarget);
  await ensureParent(versionRecordPath);
  await writeFile(
    versionRecordPath,
    `${JSON.stringify(
      {
        version: 1,
        packageName: manifest.packageName,
        packageVersion: manifest.packageVersion,
        installedAt: nowIso(),
        sourceRoot,
        copiedAssets: result.copiedAssets,
        generatedFiles: result.generatedFiles,
        preservedFiles: result.preservedFiles,
        warnings: result.warnings,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return normalizeRelPath(relative(destinationRoot, versionRecordPath));
}

export async function bootstrapHarnessPackage(options: HarnessPackageBootstrapOptions): Promise<HarnessPackageBootstrapResult> {
  const sourceRoot = resolve(options.sourceRoot ?? process.cwd());
  const destinationRoot = resolve(options.destinationRoot);
  const manifest = await loadHarnessPackageManifest(sourceRoot);
  await mkdir(destinationRoot, { recursive: true });

  const copiedAssets: string[] = [];
  for (const asset of manifest.reusableAssets) {
    copiedAssets.push(...(await copyAsset(sourceRoot, destinationRoot, manifest, asset)));
  }

  const generatedResult = await generateRepoLocalFiles(sourceRoot, destinationRoot, manifest);
  const packageJsonResult = await mergePackageJson(sourceRoot, destinationRoot, manifest);

  const result: HarnessPackageBootstrapResult = {
    version: 1,
    packageName: manifest.packageName,
    packageVersion: manifest.packageVersion,
    sourceRoot,
    destinationRoot,
    copiedAssets: copiedAssets.sort(),
    generatedFiles: generatedResult.generatedFiles.sort(),
    mergedPackageJson: packageJsonResult.merged,
    preservedFiles: generatedResult.preservedFiles.sort(),
    warnings: [...generatedResult.warnings, ...packageJsonResult.warnings],
    versionRecordPath: "",
  };

  result.versionRecordPath = await writeVersionRecord(sourceRoot, destinationRoot, manifest, result);
  return result;
}

export function renderHarnessPackageManifest(manifest: HarnessPackageManifest): string {
  const lines = [
    "Harness Package Manifest",
    `package: ${manifest.packageName}`,
    `version: ${manifest.packageVersion}`,
    `reusable assets: ${manifest.reusableAssets.length}`,
    `generated repo-local files: ${manifest.generatedFiles.length}`,
    `version record target: ${manifest.versionRecordTarget}`,
  ];
  lines.push("reusable assets:");
  for (const asset of manifest.reusableAssets) lines.push(`- ${asset}`);
  lines.push("generated files:");
  for (const rule of manifest.generatedFiles) {
    lines.push(`- ${rule.target} <= ${rule.template} (${rule.mode}${rule.requiredReview ? ", review" : ""})`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderHarnessPackageBootstrap(result: HarnessPackageBootstrapResult): string {
  const lines = [
    "Harness Package Bootstrap",
    `package: ${result.packageName}`,
    `version: ${result.packageVersion}`,
    `source root: ${result.sourceRoot}`,
    `destination root: ${result.destinationRoot}`,
    `copied assets: ${result.copiedAssets.length}`,
    `generated repo-local files: ${result.generatedFiles.length}`,
    `preserved repo-local files: ${result.preservedFiles.length}`,
    `package.json merged: ${result.mergedPackageJson ? "yes" : "no"}`,
    `version record: ${result.versionRecordPath}`,
  ];
  if (result.warnings.length > 0) {
    lines.push("warnings:");
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join("\n")}\n`;
}

function printUsage(): void {
  process.stdout.write(`Usage: node --import tsx scripts/harness-package.ts <command> [options]\n\nCommands:\n  manifest               Show the machine-readable harness package manifest\n  bootstrap              Copy reusable assets and generate repo-local placeholders into a target repo\n\nOptions:\n  --source-root <path>   Source harness repo root (default: current working directory)\n  --dest <path>          Target repo root for bootstrap\n  --json                 Emit machine-readable JSON\n  -h, --help             Show this help text\n`);
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArgs(argv: string[]): { command?: string; sourceRoot?: string; dest?: string; json: boolean; help: boolean } {
  const [command, ...rest] = argv;
  const result: { command?: string; sourceRoot?: string; dest?: string; json: boolean; help: boolean } = {
    command,
    json: false,
    help: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      result.json = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      result.help = true;
      continue;
    }
    if (arg === "--source-root") {
      result.sourceRoot = requireValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--dest") {
      result.dest = requireValue(rest, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.command) {
    printUsage();
    return;
  }

  if (args.command === "manifest") {
    const manifest = await loadHarnessPackageManifest(args.sourceRoot ?? process.cwd());
    process.stdout.write(args.json ? `${JSON.stringify(manifest, null, 2)}\n` : renderHarnessPackageManifest(manifest));
    return;
  }

  if (args.command === "bootstrap") {
    if (!args.dest) throw new Error("bootstrap requires --dest.");
    const result = await bootstrapHarnessPackage({
      sourceRoot: args.sourceRoot ?? process.cwd(),
      destinationRoot: args.dest,
    });
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderHarnessPackageBootstrap(result));
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`harness-package failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
