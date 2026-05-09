import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { createHash } from "node:crypto";

export type CompactToolResultStatus = "ok" | "failed";

export type CompactToolResultEnvelope = {
  status: CompactToolResultStatus;
  tool: "read" | "write" | "edit" | "bash";
  summary: string;
  paths: string[];
  counts: Record<string, number | null>;
  truncated: boolean;
  artifactPath: string | null;
  nextAction: string | null;
  command?: string;
  exitCode?: number | null;
  durationMs?: number | null;
  hashes?: { sha256?: string };
  excerpts?: {
    stdout?: string[];
    stderr?: string[];
  };
};

type CompactOptions = {
  startedAtMs?: number;
  endedAtMs?: number;
  maxExcerptLines?: number;
};

const SUPPORTED_TOOLS = new Set(["read", "write", "edit", "bash"]);
const DEFAULT_MAX_EXCERPT_LINES = 12;

function textFromContent(content: ToolResultEvent["content"]): string {
  return content
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter((value) => value.length > 0)
    .join("\n");
}

function boundedLines(text: string, maxLines: number, mode: "head" | "tail" | "both" = "tail"): { lines: string[]; truncated: boolean } {
  const lines = text.length === 0 ? [] : text.split(/\r?\n/);
  if (lines.length <= maxLines) return { lines, truncated: false };
  if (mode === "both") {
    if (maxLines <= 2) return { lines: lines.slice(0, maxLines), truncated: true };
    const headCount = Math.floor((maxLines - 1) / 2);
    const tailCount = maxLines - headCount - 1;
    return {
      lines: [...lines.slice(0, headCount), `... ${lines.length - headCount - tailCount} lines omitted ...`, ...lines.slice(-tailCount)],
      truncated: true,
    };
  }
  return {
    lines: mode === "head" ? lines.slice(0, maxLines) : lines.slice(-maxLines),
    truncated: true,
  };
}

function countLogicalLines(text: string): number {
  if (text.length === 0) return 0;
  return text.endsWith("\n") ? text.slice(0, -1).split(/\r?\n/).length : text.split(/\r?\n/).length;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function stringInput(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function artifactPathFromDetails(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const value = (details as { fullOutputPath?: unknown }).fullOutputPath;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseExitCode(text: string, isError: boolean): number | null {
  const match = /(?:exit code|exited with code):?\s*(\d+)/i.exec(text);
  if (match) return Number.parseInt(match[1] ?? "", 10);
  return isError ? null : 0;
}

function diffStats(diff: string | undefined): { additions: number; removals: number } {
  if (!diff) return { additions: 0, removals: 0 };
  let additions = 0;
  let removals = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) removals += 1;
  }
  return { additions, removals };
}

function statusFor(event: ToolResultEvent): CompactToolResultStatus {
  return event.isError ? "failed" : "ok";
}

function durationMs(options: CompactOptions): number | null {
  if (typeof options.startedAtMs !== "number") return null;
  const end = typeof options.endedAtMs === "number" ? options.endedAtMs : Date.now();
  return Math.max(0, end - options.startedAtMs);
}

export function buildCompactToolResultEnvelope(event: ToolResultEvent, options: CompactOptions = {}): CompactToolResultEnvelope | null {
  if (!SUPPORTED_TOOLS.has(event.toolName)) return null;

  const maxLines = Math.max(1, options.maxExcerptLines ?? DEFAULT_MAX_EXCERPT_LINES);
  const status = statusFor(event);
  const text = textFromContent(event.content);
  const path = stringInput(event.input, "path");
  const artifactPath = artifactPathFromDetails(event.details);
  const base: Omit<CompactToolResultEnvelope, "tool" | "summary"> = {
    status,
    paths: path ? [path] : [],
    counts: {},
    truncated: false,
    artifactPath,
    nextAction: status === "failed" ? "Inspect the bounded failure excerpt; retrieve artifactPath only if more output is needed." : null,
  };

  if (event.toolName === "write") {
    const content = stringInput(event.input, "content") ?? "";
    return {
      ...base,
      tool: "write",
      summary: status === "ok" ? `write completed for ${path ?? "unknown path"}` : `write failed for ${path ?? "unknown path"}`,
      counts: {
        bytes: Buffer.byteLength(content, "utf8"),
        lines: countLogicalLines(content),
      },
      hashes: { sha256: sha256(content) },
    };
  }

  if (event.toolName === "edit") {
    const edits = Array.isArray(event.input.edits) ? event.input.edits : [];
    const details = event.details && typeof event.details === "object" ? (event.details as { diff?: string }) : undefined;
    const stats = diffStats(details?.diff);
    return {
      ...base,
      tool: "edit",
      summary: status === "ok" ? `edit completed for ${path ?? "unknown path"}` : `edit failed for ${path ?? "unknown path"}`,
      counts: {
        replacements: edits.length,
        additions: stats.additions,
        removals: stats.removals,
      },
    };
  }

  if (event.toolName === "bash") {
    const excerpt = boundedLines(text, maxLines, status === "failed" ? "both" : "tail");
    const command = stringInput(event.input, "command") ?? "";
    return {
      ...base,
      tool: "bash",
      summary: status === "ok" ? `bash completed: ${command}` : `bash failed: ${command}`,
      counts: {
        outputBytes: Buffer.byteLength(text, "utf8"),
        outputLines: countLogicalLines(text),
      },
      truncated: excerpt.truncated || Boolean(artifactPath),
      command,
      exitCode: parseExitCode(text, event.isError),
      durationMs: durationMs(options),
      excerpts: { stdout: excerpt.lines },
    };
  }

  if (event.toolName === "read") {
    const excerpt = boundedLines(text, maxLines, "head");
    const details = event.details && typeof event.details === "object" ? (event.details as { truncation?: { truncated?: boolean; totalLines?: number } }) : undefined;
    return {
      ...base,
      tool: "read",
      summary: status === "ok" ? `read completed for ${path ?? "unknown path"}` : `read failed for ${path ?? "unknown path"}`,
      counts: {
        bytes: Buffer.byteLength(text, "utf8"),
        lines: countLogicalLines(text),
        totalLines: details?.truncation?.totalLines ?? null,
      },
      truncated: excerpt.truncated || Boolean(details?.truncation?.truncated),
      excerpts: { stdout: excerpt.lines },
    };
  }

  return null;
}

export function compactToolResultEvent(event: ToolResultEvent, options: CompactOptions = {}) {
  const envelope = buildCompactToolResultEnvelope(event, options);
  if (!envelope) return {};

  return {
    content: [{ type: "text", text: `${JSON.stringify(envelope, null, 2)}\n` }],
    details: {
      compactEnvelope: envelope,
      originalDetails: event.details ?? null,
    },
    isError: event.isError,
  };
}

export default function toolResultEnvelope(pi: ExtensionAPI) {
  const startedAtByToolCallId = new Map<string, number>();

  pi.on("tool_execution_start", (event) => {
    if (SUPPORTED_TOOLS.has(event.toolName)) startedAtByToolCallId.set(event.toolCallId, Date.now());
  });

  pi.on("tool_execution_end", (event) => {
    startedAtByToolCallId.delete(event.toolCallId);
  });

  (pi as any).on("tool_result", (event: ToolResultEvent) => {
    if (!SUPPORTED_TOOLS.has(event.toolName)) return undefined;
    return compactToolResultEvent(event, {
      startedAtMs: startedAtByToolCallId.get(event.toolCallId),
    });
  });
}
