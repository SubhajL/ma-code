import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

// Pi treats `.pi/SYSTEM.md` as a full replacement for its default system
// prompt, which also drops every extension's promptSnippet/promptGuidelines.
// Project guidance must be appended (`.pi/APPEND_SYSTEM.md`) instead.
test("project system guidance is appended to pi's default prompt, not replacing it", async () => {
  // An empty agentDir keeps the operator's global ~/.pi/agent prompt files out of the assertion.
  const agentDir = await mkdtemp(join(tmpdir(), "pi-agent-dir-"));
  const loader = new DefaultResourceLoader({
    cwd: repoRoot,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });

  await loader.reload();

  assert.equal(loader.getSystemPrompt(), undefined, "a project SYSTEM.md would replace pi's default prompt and tool guidance");
  assert.match(loader.getAppendSystemPrompt().join("\n"), /^# Pi Project System Guidance$/m);
});
