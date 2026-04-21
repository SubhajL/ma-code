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

  constructor(private readonly branch: string | null = "feat/test") {}

  registerTool(tool: ToolRegistration): void {
    this.tools.set(tool.name, tool);
  }

  on(event: string, handler: (...args: any[]) => Promise<any> | any): void {
    this.handlers.set(event, handler);
  }

  async exec(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    if (command === "git" && args.slice(-2).join(" ") === "branch --show-current") {
      return {
        code: 0,
        stdout: `${this.branch ?? ""}\n`,
        stderr: "",
      };
    }

    return {
      code: 1,
      stdout: "",
      stderr: `unsupported command: ${command} ${args.join(" ")}`,
    };
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
