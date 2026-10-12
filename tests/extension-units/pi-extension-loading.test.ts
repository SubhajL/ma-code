import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DefaultPackageManager,
  DefaultResourceLoader,
  type LoadExtensionsResult,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const extensionsDir = join(repoRoot, ".pi/agent/extensions");

// Composite modules that re-export split modules and re-register their tools. pi loads every
// extension file as its own module with its own ExtensionAPI, so loading a composite next to
// its split modules registers those tools twice. They stay out of .pi/settings.json.
const COMPOSITE_FACADES = ["packets.ts", "recovery.ts"];

let loaded: Promise<LoadExtensionsResult> | undefined;

// Runs pi's own resource loader against the project settings, with an empty agent dir so
// that global ~/.pi/agent extensions cannot affect the result.
function loadProjectExtensions(): Promise<LoadExtensionsResult> {
  loaded ??= (async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "pi-extension-loading-"));
    try {
      const loader = new DefaultResourceLoader({
        cwd: repoRoot,
        agentDir,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      });
      await loader.reload();
      return loader.getExtensions();
    } finally {
      await rm(agentDir, { recursive: true, force: true });
    }
  })();
  return loaded;
}

// Asks pi which extension entry points it would discover if the settings named the whole
// extensions directory: top-level .ts/.js files and symlinks, plus subdirectories with an
// index file or a package.json "pi" manifest.
async function discoverExtensionDirectory(): Promise<string[]> {
  const root = await mkdtemp(join(tmpdir(), "pi-extension-discovery-"));
  try {
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(join(cwd, ".pi/settings.json"), JSON.stringify({ extensions: [extensionsDir] }));
    const packageManager = new DefaultPackageManager({
      cwd,
      agentDir,
      settingsManager: SettingsManager.create(cwd, agentDir),
    });
    const resolved = await packageManager.resolve();
    return resolved.extensions.filter((resource) => resource.enabled).map((resource) => resource.path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("pi's real loader registers the project extensions without conflicts or load errors", async () => {
  const result = await loadProjectExtensions();
  // pi reports duplicate tools and flags as errors; duplicate commands are checked here.
  const commandOwners = new Map<string, string>();
  const duplicateCommands: string[] = [];
  for (const extension of result.extensions) {
    for (const name of extension.commands.keys()) {
      const owner = commandOwners.get(name);
      if (owner) duplicateCommands.push(`/${name}: ${basename(owner)} and ${basename(extension.path)}`);
      else commandOwners.set(name, extension.path);
    }
  }

  assert.deepEqual(
    result.errors.map((entry) => `${relative(repoRoot, entry.path)}: ${entry.error}`),
    [],
  );
  assert.deepEqual(duplicateCommands, []);
});

test("pi loads every extension in the extensions directory except the composite facades", async () => {
  const result = await loadProjectExtensions();
  const discovered = (await discoverExtensionDirectory()).map((path) => relative(extensionsDir, path));
  const expected = discovered.filter((path) => !COMPOSITE_FACADES.includes(path)).sort();
  const actual = result.extensions.map((extension) => relative(extensionsDir, extension.path)).sort();

  assert.ok(
    COMPOSITE_FACADES.every((facade) => discovered.includes(facade)),
    "directory discovery should see the composite facades; the oracle is not reading the extensions directory",
  );
  assert.deepEqual(
    actual,
    expected,
    `List each extension entry point in the "extensions" array of .pi/settings.json; keep ${COMPOSITE_FACADES.join(", ")} out.`,
  );
});

test("every entry in the project extensions list loads", async () => {
  const result = await loadProjectExtensions();
  const settings = JSON.parse(await readFile(join(repoRoot, ".pi/settings.json"), "utf8")) as { extensions?: string[] };
  // pi skips a listed path that does not exist without reporting an error.
  const listed = (settings.extensions ?? []).map((entry) => relative(extensionsDir, resolve(repoRoot, ".pi", entry))).sort();
  const actual = result.extensions.map((extension) => relative(extensionsDir, extension.path)).sort();

  assert.deepEqual(listed, actual);
});
