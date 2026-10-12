import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileRaw = promisify(execFileCallback);
const script = fileURLToPath(new URL("../../scripts/harness-hooks-install.mjs", import.meta.url));
// Keep the developer's global and system git config (e.g. a global core.hooksPath) out of these repos.
const isolatedEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const execFile = (file: string, args: string[], options: { cwd?: string } = {}) =>
  execFileRaw(file, args, { ...options, env: isolatedEnv });

async function gitRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "harness-hooks-install-"));
  await execFile("git", ["init", "-q", root]);
  return root;
}

async function hooksPath(cwd: string): Promise<string> {
  return (await execFile("git", ["config", "--get", "core.hooksPath"], { cwd }).catch(() => ({ stdout: "" }))).stdout.trim();
}

async function install(cwd: string, ...args: string[]) {
  return execFile(process.execPath, [script, ...args], { cwd }).then(
    (result) => ({ code: 0, ...result }),
    (error: { code: number; stdout: string; stderr: string }) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }),
  );
}

test("hooks install points git at .githooks when no hooks path is set, or when it is git's default", async () => {
  const fresh = await gitRepo();
  assert.equal((await install(fresh)).code, 0);
  assert.equal(await hooksPath(fresh), ".githooks");

  const defaulted = await gitRepo();
  await execFile("git", ["config", "core.hooksPath", join(defaulted, ".git", "hooks")], { cwd: defaulted });
  assert.equal((await install(defaulted)).code, 0);
  assert.equal(await hooksPath(defaulted), ".githooks");
});

test("hooks install treats a global hooks path as another hooks setup", async () => {
  const repo = await gitRepo();
  const globalConfig = join(repo, "global.gitconfig");
  await writeFile(globalConfig, "[core]\n\thooksPath = ~/.git-hooks\n", "utf8");

  const refused = await execFileRaw(process.execPath, [script], {
    cwd: repo,
    env: { ...isolatedEnv, GIT_CONFIG_GLOBAL: globalConfig },
  }).then(
    () => ({ code: 0, stderr: "" }),
    (error: { code: number; stderr: string }) => ({ code: error.code, stderr: error.stderr }),
  );

  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /global/);
});

test("hooks install refuses to replace another hooks setup unless forced", async () => {
  const repo = await gitRepo();
  await execFile("git", ["config", "core.hooksPath", ".husky/_"], { cwd: repo });

  const refused = await install(repo);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /already \.husky\/_/);
  assert.equal(await hooksPath(repo), ".husky/_");

  assert.equal((await install(repo, "--force")).code, 0);
  assert.equal(await hooksPath(repo), ".githooks");
});

test("hooks install from a subdirectory install points at that directory's .githooks", async () => {
  const repo = await gitRepo();
  const subdirectory = join(repo, "packages", "tool");
  await mkdir(subdirectory, { recursive: true });

  assert.equal((await install(subdirectory)).code, 0);
  assert.equal(await hooksPath(repo), "packages/tool/.githooks");
});

test("hooks install accepts its own target however it is written, and git's default from a subdirectory", async () => {
  const repo = await gitRepo();
  await execFile("git", ["config", "core.hooksPath", join(repo, ".githooks")], { cwd: repo });
  assert.equal((await install(repo)).code, 0);

  const nested = await gitRepo();
  const subdirectory = join(nested, "packages", "tool");
  await mkdir(subdirectory, { recursive: true });
  await execFile("git", ["config", "core.hooksPath", ".git/hooks"], { cwd: nested });
  assert.equal((await install(subdirectory)).code, 0);
  assert.equal(await hooksPath(nested), "packages/tool/.githooks");
});

test("hooks install still refuses on a git without --show-scope", async () => {
  const repo = await gitRepo();
  await execFile("git", ["config", "core.hooksPath", ".husky/_"], { cwd: repo });
  // A git that predates `config --show-scope` (2.26) exits 129 for it.
  const realGit = (await execFile("sh", ["-c", "command -v git"])).stdout.trim();
  const fakeBin = join(repo, "fake-bin");
  await mkdir(fakeBin);
  await writeFile(
    join(fakeBin, "git"),
    `#!/bin/sh\ncase " $* " in *" --show-scope "*) echo "error: unknown option" >&2; exit 129;; esac\nexec "${realGit}" "$@"\n`,
    { mode: 0o755 },
  );

  const refused = await execFileRaw(process.execPath, [script], {
    cwd: repo,
    env: { ...isolatedEnv, PATH: `${fakeBin}:${process.env.PATH}` },
  }).then(
    () => ({ code: 0 }),
    (error: { code: number }) => ({ code: error.code }),
  );

  assert.equal(refused.code, 1);
  assert.equal(await hooksPath(repo), ".husky/_");
});

test("hooks install warns when the .githooks/pre-push it enables does not run harness:check", async () => {
  const repo = await gitRepo();
  await mkdir(join(repo, ".githooks"));
  await writeFile(join(repo, ".githooks", "pre-push"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const result = await install(repo);

  assert.equal(result.code, 0);
  assert.match(result.stderr, /does not run harness:check/);
});

test("the pre-push hook runs harness:check from its package even when reached through .git/hooks", async () => {
  // The harness lives in a subdirectory; the repo root has its own package.json. Only resolving the
  // hook's real location runs the harness's harness:check rather than the root's.
  const repo = await gitRepo();
  const tool = join(repo, "tool");
  const hook = fileURLToPath(new URL("../../.githooks/pre-push", import.meta.url));
  const marker = (name: string) => `node -e "require('fs').writeFileSync('${name}', '')"`;
  await mkdir(join(tool, ".githooks"), { recursive: true });
  await writeFile(join(tool, ".githooks", "pre-push"), await readFile(hook, "utf8"), { mode: 0o755 });
  await writeFile(join(tool, "package.json"), JSON.stringify({ name: "tool", scripts: { "harness:check": marker("ran-in-tool") } }), "utf8");
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "root", scripts: { "harness:check": marker("ran-at-root") } }), "utf8");
  await execFile("git", ["add", "-A"], { cwd: repo });
  await execFile("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-qm", "init"], { cwd: repo });
  await rm(join(repo, ".git", "hooks"), { recursive: true, force: true });
  await mkdir(join(repo, ".git", "hooks"));
  await symlink("../../tool/.githooks/pre-push", join(repo, ".git", "hooks", "pre-push"));
  const head = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repo })).stdout.trim();

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(join(repo, ".git", "hooks", "pre-push"), ["origin", "unused"], { cwd: repo, env: isolatedEnv, stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolvePromise() : reject(new Error(`hook exited ${code}`))));
    child.stdin.end(`refs/heads/main ${head} refs/heads/main ${"0".repeat(40)}\n`);
  });

  assert.equal(await stat(join(tool, "ran-in-tool")).then(() => true, () => false), true, "the harness's own harness:check ran");
  assert.equal(await stat(join(repo, "ran-at-root")).then(() => true, () => false), false, "the repo root's script did not run");
});
