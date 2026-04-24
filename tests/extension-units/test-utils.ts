import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type ToolRegistration = {
  name: string;
  execute: (...args: any[]) => Promise<any> | any;
};

type RepoExecState = {
  currentBranch: string | null;
  statusPorcelain: string;
  branches: Set<string>;
  failSwitchBranches: Set<string>;
  gitCommonDir: string | null;
};

export class FakePi {
  private readonly tools = new Map<string, ToolRegistration>();
  private readonly handlers = new Map<string, (...args: any[]) => Promise<any> | any>();
  private readonly defaultState: RepoExecState;
  private readonly repoStates = new Map<string, RepoExecState>();

  constructor(
    branch: string | null = "feat/test",
    options: {
      statusPorcelain?: string;
      existingBranches?: string[];
      failSwitchBranches?: string[];
      cwdStates?: Record<
        string,
        {
          branch?: string | null;
          statusPorcelain?: string;
          existingBranches?: string[];
          failSwitchBranches?: string[];
          gitCommonDir?: string | null;
        }
      >;
    } = {},
  ) {
    this.defaultState = this.makeState(branch, options);

    for (const [cwd, state] of Object.entries(options.cwdStates ?? {})) {
      this.repoStates.set(
        cwd,
        this.makeState(state.branch !== undefined ? state.branch : branch, {
          statusPorcelain: state.statusPorcelain,
          existingBranches: state.existingBranches,
          failSwitchBranches: state.failSwitchBranches,
          gitCommonDir: state.gitCommonDir,
        }),
      );
    }
  }

  private makeState(
    branch: string | null,
    options: {
      statusPorcelain?: string;
      existingBranches?: string[];
      failSwitchBranches?: string[];
      gitCommonDir?: string | null;
    } = {},
  ): RepoExecState {
    const branches = new Set<string>();
    for (const name of options.existingBranches ?? []) branches.add(name);
    if (branch) branches.add(branch);

    return {
      currentBranch: branch,
      statusPorcelain: options.statusPorcelain ?? "",
      branches,
      failSwitchBranches: new Set(options.failSwitchBranches ?? []),
      gitCommonDir: options.gitCommonDir !== undefined ? options.gitCommonDir : ".git",
    };
  }

  private getState(cwd?: string): RepoExecState {
    if (cwd && this.repoStates.has(cwd)) return this.repoStates.get(cwd)!;
    return this.defaultState;
  }

  registerTool(tool: ToolRegistration): void {
    this.tools.set(tool.name, tool);
  }

  on(event: string, handler: (...args: any[]) => Promise<any> | any): void {
    this.handlers.set(event, handler);
  }

  async exec(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    if (command === "git") {
      const cwd = args[0] === "-C" ? args[1] : undefined;
      const gitArgs = args[0] === "-C" ? args.slice(2) : args;
      const state = this.getState(cwd);

      if (gitArgs[0] === "branch" && gitArgs[1] === "--show-current") {
        return {
          code: 0,
          stdout: `${state.currentBranch ?? ""}\n`,
          stderr: "",
        };
      }

      if (gitArgs[0] === "rev-parse" && gitArgs[1] === "--git-common-dir") {
        if (!state.gitCommonDir) {
          return {
            code: 1,
            stdout: "",
            stderr: "not a git repository",
          };
        }
        return {
          code: 0,
          stdout: `${state.gitCommonDir}\n`,
          stderr: "",
        };
      }

      if (gitArgs[0] === "status" && gitArgs[1] === "--porcelain") {
        return {
          code: 0,
          stdout: state.statusPorcelain,
          stderr: "",
        };
      }

      if (gitArgs[0] === "branch" && gitArgs[1] === "--list") {
        const branchName = gitArgs[2] ?? "";
        return {
          code: 0,
          stdout: state.branches.has(branchName) ? `${branchName}\n` : "",
          stderr: "",
        };
      }

      if (gitArgs[0] === "switch" && gitArgs[1] === "-c") {
        const branchName = gitArgs[2] ?? "";
        if (state.failSwitchBranches.has(branchName)) {
          return {
            code: 1,
            stdout: "",
            stderr: `simulated switch failure for ${branchName}`,
          };
        }
        state.branches.add(branchName);
        state.currentBranch = branchName;
        return {
          code: 0,
          stdout: "",
          stderr: "",
        };
      }

      if (gitArgs[0] === "switch") {
        const branchName = gitArgs[1] ?? "";
        if (!state.branches.has(branchName)) {
          return {
            code: 1,
            stdout: "",
            stderr: `unknown branch ${branchName}`,
          };
        }
        if (state.failSwitchBranches.has(branchName)) {
          return {
            code: 1,
            stdout: "",
            stderr: `simulated switch failure for ${branchName}`,
          };
        }
        state.currentBranch = branchName;
        return {
          code: 0,
          stdout: "",
          stderr: "",
        };
      }
    }

    return {
      code: 1,
      stdout: "",
      stderr: `unsupported command: ${command} ${args.join(" ")}`,
    };
  }

  getCurrentBranchName(cwd?: string): string | null {
    return this.getState(cwd).currentBranch;
  }

  getTool(name: string): ToolRegistration {
    const tool = this.tools.get(name);
    assert(tool, `expected tool registration for ${name}`);
    return tool;
  }

  getHandler(name: string): (...args: any[]) => Promise<any> | any {
    const handler = this.handlers.get(name);
    assert(handler, `expected handler registration for ${name}`);
    return handler;
  }
}

export function makeCtx(
  cwd: string,
  options: {
    modelId?: string;
    hasUI?: boolean;
    confirmResult?: boolean;
  } = {},
) {
  return {
    cwd,
    hasUI: options.hasUI ?? false,
    model: {
      id: options.modelId ?? "openai-codex/gpt-5.4",
    },
    ui: {
      confirm: async () => options.confirmResult ?? false,
      notify: () => {},
    },
  };
}

export async function makeTempRepo(prefix: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(cwd, ".pi", "agent", "state", "runtime"), { recursive: true });
  return cwd;
}

export function textContent(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: Array<{ text?: string }> }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (typeof block?.text === "string" ? block.text : ""))
    .filter((value) => value.length > 0)
    .join("\n");
}

export async function readAuditLog(cwd: string): Promise<string> {
  return readFile(join(cwd, "logs", "harness-actions.jsonl"), "utf8");
}

export async function copyFixtureRepoFile(cwd: string, relativePath: string): Promise<void> {
  const source = new URL(`../../${relativePath}`, import.meta.url);
  const destination = join(cwd, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
