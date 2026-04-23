import assert from "node:assert/strict";
import { copyFile, mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type ToolRegistration = {
  name: string;
  execute: (...args: any[]) => Promise<any> | any;
};

export class FakePi {
  private readonly tools = new Map<string, ToolRegistration>();
  private readonly handlers = new Map<string, (...args: any[]) => Promise<any> | any>();
  private readonly branches = new Set<string>();
  private readonly failSwitchBranches = new Set<string>();
  private currentBranch: string | null;
  private statusPorcelain: string;

  constructor(
    branch: string | null = "feat/test",
    options: {
      statusPorcelain?: string;
      existingBranches?: string[];
      failSwitchBranches?: string[];
    } = {},
  ) {
    this.currentBranch = branch;
    this.statusPorcelain = options.statusPorcelain ?? "";

    for (const name of options.existingBranches ?? []) {
      this.branches.add(name);
    }
    if (branch) this.branches.add(branch);

    for (const name of options.failSwitchBranches ?? []) {
      this.failSwitchBranches.add(name);
    }
  }

  registerTool(tool: ToolRegistration): void {
    this.tools.set(tool.name, tool);
  }

  on(event: string, handler: (...args: any[]) => Promise<any> | any): void {
    this.handlers.set(event, handler);
  }

  async exec(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    if (command === "git") {
      const gitArgs = args[0] === "-C" ? args.slice(2) : args;

      if (gitArgs[0] === "branch" && gitArgs[1] === "--show-current") {
        return {
          code: 0,
          stdout: `${this.currentBranch ?? ""}\n`,
          stderr: "",
        };
      }

      if (gitArgs[0] === "status" && gitArgs[1] === "--porcelain") {
        return {
          code: 0,
          stdout: this.statusPorcelain,
          stderr: "",
        };
      }

      if (gitArgs[0] === "branch" && gitArgs[1] === "--list") {
        const branchName = gitArgs[2] ?? "";
        return {
          code: 0,
          stdout: this.branches.has(branchName) ? `${branchName}\n` : "",
          stderr: "",
        };
      }

      if (gitArgs[0] === "switch" && gitArgs[1] === "-c") {
        const branchName = gitArgs[2] ?? "";
        if (this.failSwitchBranches.has(branchName)) {
          return {
            code: 1,
            stdout: "",
            stderr: `simulated switch failure for ${branchName}`,
          };
        }
        this.branches.add(branchName);
        this.currentBranch = branchName;
        return {
          code: 0,
          stdout: "",
          stderr: "",
        };
      }

      if (gitArgs[0] === "switch") {
        const branchName = gitArgs[1] ?? "";
        if (!this.branches.has(branchName)) {
          return {
            code: 1,
            stdout: "",
            stderr: `unknown branch ${branchName}`,
          };
        }
        if (this.failSwitchBranches.has(branchName)) {
          return {
            code: 1,
            stdout: "",
            stderr: `simulated switch failure for ${branchName}`,
          };
        }
        this.currentBranch = branchName;
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

  getCurrentBranchName(): string | null {
    return this.currentBranch;
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
