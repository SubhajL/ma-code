#!/usr/bin/env node
// Points git at this harness's tracked .githooks directory, so every push runs the harness check first.
// Refuses to replace another hooks setup (husky, pre-commit, ...) unless run with --force.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
// The effective setting and where it comes from (local, global, system), so a global hooks setup counts too.
// `git config` exits 1 when the key is unset; any other failure (e.g. no --show-scope before git 2.26)
// falls back to reading the value without its scope rather than treating it as unset.
const currentHooksPath = () => {
  try {
    const [origin, value] = git("config", "--show-scope", "--get", "core.hooksPath").split("\t");
    return { value: value ?? "", scope: origin };
  } catch (error) {
    if (error.status === 1) return { value: "", scope: "" };
    try {
      return { value: git("config", "--get", "core.hooksPath"), scope: "unknown" };
    } catch (fallbackError) {
      if (fallbackError.status === 1) return { value: "", scope: "" };
      throw fallbackError;
    }
  }
};

// Relative hook paths resolve from the work-tree root, so a harness installed in a subdirectory needs its prefix.
const target = `${git("rev-parse", "--show-prefix")}.githooks`;
const { value: current, scope } = currentHooksPath();
// Compare real paths: the repo may be reached through a symlink (e.g. /var -> /private/var on macOS).
// A path that does not exist yet resolves through its nearest existing parent.
const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(real(parent), basename(path));
  }
};
const topLevel = git("rev-parse", "--show-toplevel");
// --git-common-dir is relative to the current directory; a relative core.hooksPath to the work-tree root.
const defaultHooks = real(resolve(process.cwd(), git("rev-parse", "--git-common-dir"), "hooks"));
const currentReal = current === "" ? "" : real(resolve(topLevel, current));
const isUnset = current === "" || currentReal === defaultHooks;
const isTarget = currentReal === real(resolve(topLevel, target));

if (!isTarget && !isUnset && !process.argv.includes("--force")) {
  console.error(
    `core.hooksPath is already ${current} (${scope} config); leaving it alone so those hooks keep running. ` +
      `Chain .githooks/pre-push from them, or replace them for this repo with: npm run harness:hooks:install -- --force`,
  );
  process.exit(1);
}
git("config", "core.hooksPath", target);
console.log(`core.hooksPath -> ${target}`);
let hook = "";
try {
  hook = readFileSync(resolve(topLevel, target, "pre-push"), "utf8");
} catch {
  hook = "";
}
if (!hook.includes("harness:check")) {
  console.error(
    `warning: ${target}/pre-push does not run harness:check (the install kept an existing hook there), so pushes are not gated by the harness. ` +
      "Add `npm run harness:check` to it.",
  );
}
