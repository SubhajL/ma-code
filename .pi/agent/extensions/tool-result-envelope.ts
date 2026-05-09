import type { ExtensionAPI, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { createHash } from "node:crypto";

export type CompactToolResultStatus = "ok" | "failed";

export type CompactToolResultEnvelope = {
  status: CompactToolResultStatus;
  tool: string;
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
  maxExcerptLineChars?: number;
  maxSerializedBytes?: number;
};

const SUPPORTED_TOOLS = new Set(["read", "write", "edit", "bash"]);
const DEFAULT_MAX_EXCERPT_LINES = 12;
const DEFAULT_MAX_EXCERPT_LINE_CHARS = 500;
const DEFAULT_MAX_SERIALIZED_BYTES = 20_000;
const EMERGENCY_MAX_EXCERPT_LINES = 2;
const EMERGENCY_MAX_EXCERPT_LINE_CHARS = 160;

function textFromContent(content: ToolResultEvent["content"]): string {
  return content
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter((value) => value.length > 0)
    .join("\n");
}

function truncateLine(line: string, maxChars: number): { line: string; truncated: boolean } {
  if (line.length <= maxChars) return { line, truncated: false };
  const marker = `… [truncated ${line.length - maxChars} chars]`;
  const keep = Math.max(0, maxChars - marker.length);
  return { line: `${line.slice(0, keep)}${marker}`, truncated: true };
}

function boundedLines(
  text: string,
  maxLines: number,
  mode: "head" | "tail" | "both" = "tail",
  maxLineChars = DEFAULT_MAX_EXCERPT_LINE_CHARS,
): { lines: string[]; truncated: boolean } {
  const allLines = text.length === 0 ? [] : text.split(/\r?\n/);
  let selected = allLines;
  let omittedLineCount = 0;
  let truncated = false;
  if (allLines.length > maxLines) {
    truncated = true;
    if (mode === "both") {
      if (maxLines <= 2) {
        selected = allLines.slice(0, maxLines);
        omittedLineCount = allLines.length - selected.length;
      } else {
        const headCount = Math.floor((maxLines - 1) / 2);
        const tailCount = maxLines - headCount - 1;
        omittedLineCount = allLines.length - headCount - tailCount;
        selected = [...allLines.slice(0, headCount), `... ${omittedLineCount} lines omitted ...`, ...allLines.slice(-tailCount)];
      }
    } else {
      selected = mode === "head" ? allLines.slice(0, maxLines) : allLines.slice(-maxLines);
      omittedLineCount = allLines.length - selected.length;
    }
  }

  const bounded = selected.map((line) => {
    const result = truncateLine(line, maxLineChars);
    if (result.truncated) truncated = true;
    return result.line;
  });
  if (omittedLineCount > 0 && mode !== "both") truncated = true;
  return { lines: bounded, truncated };
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

function serializedByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return Buffer.byteLength(String(value), "utf8");
  }
}

function eventPayloadByteLength(event: ToolResultEvent): number {
  return serializedByteLength({ content: event.content, details: event.details });
}

function normalizedMaxSerializedBytes(options: CompactOptions): number {
  return Math.max(1, options.maxSerializedBytes ?? DEFAULT_MAX_SERIALIZED_BYTES);
}

function normalizedMaxLines(options: CompactOptions): number {
  return Math.max(1, options.maxExcerptLines ?? DEFAULT_MAX_EXCERPT_LINES);
}

function normalizedMaxLineChars(options: CompactOptions): number {
  return Math.max(1, options.maxExcerptLineChars ?? DEFAULT_MAX_EXCERPT_LINE_CHARS);
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

function buildGenericToolResultEnvelope(event: ToolResultEvent, options: CompactOptions = {}): CompactToolResultEnvelope | null {
  const maxSerializedBytes = normalizedMaxSerializedBytes(options);
  const originalSerializedBytes = eventPayloadByteLength(event);
  if (originalSerializedBytes <= maxSerializedBytes) return null;

  const text = textFromContent(event.content);
  const maxLines = normalizedMaxLines(options);
  const maxLineChars = normalizedMaxLineChars(options);
  const excerpt = boundedLines(text, maxLines, "both", maxLineChars);
  const detailsBytes = event.details === undefined ? 0 : serializedByteLength(event.details);
  const artifactPath = artifactPathFromDetails(event.details);

  return {
    status: statusFor(event),
    tool: event.toolName,
    summary: `${event.toolName} returned an oversized result; compacted by global result-size guard.`,
    paths: [],
    counts: {
      contentBytes: Buffer.byteLength(text, "utf8"),
      contentLines: countLogicalLines(text),
      detailsBytes,
      originalSerializedBytes,
    },
    truncated: true,
    artifactPath,
    nextAction: artifactPath ? "Inspect artifactPath only if the compact excerpt is insufficient." : "Rerun with a narrower request or explicit artifact capture if full output is required.",
    excerpts: text.length > 0 ? { stdout: excerpt.lines } : undefined,
  };
}

export function buildCompactToolResultEnvelope(event: ToolResultEvent, options: CompactOptions = {}): CompactToolResultEnvelope | null {
  if (!SUPPORTED_TOOLS.has(event.toolName)) return buildGenericToolResultEnvelope(event, options);

  const maxLines = normalizedMaxLines(options);
  const maxLineChars = normalizedMaxLineChars(options);
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
    const excerpt = boundedLines(text, maxLines, "head", maxLineChars);
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

function toolResultReplacement(envelope: CompactToolResultEnvelope, event: ToolResultEvent, options: CompactOptions = {}) {
  const maxSerializedBytes = normalizedMaxSerializedBytes(options);
  const replacement = {
    content: [{ type: "text", text: `${JSON.stringify(envelope, null, 2)}\n` }],
    details: {
      compactEnvelope: envelope,
      originalDetailsOmitted: event.details !== undefined,
    },
    isError: event.isError,
  };

  if (serializedByteLength(replacement) <= maxSerializedBytes) return replacement;

  const text = textFromContent(event.content);
  const emergencyExcerpt = text.length > 0
    ? boundedLines(text, EMERGENCY_MAX_EXCERPT_LINES, "both", EMERGENCY_MAX_EXCERPT_LINE_CHARS).lines
    : undefined;
  const emergencyEnvelope: CompactToolResultEnvelope = {
    status: envelope.status,
    tool: envelope.tool,
    summary: `${envelope.tool} result exceeded compact budget after normal compaction; returned emergency summary.`,
    paths: envelope.paths.slice(0, 5),
    counts: {
      ...envelope.counts,
      compactedSerializedBytes: serializedByteLength(replacement),
      maxSerializedBytes,
    },
    truncated: true,
    artifactPath: envelope.artifactPath,
    nextAction: envelope.artifactPath ? "Inspect artifactPath only if more output is needed." : "Use a narrower command/query or arrange artifact capture for full output.",
    excerpts: emergencyExcerpt ? { stdout: emergencyExcerpt } : undefined,
  };

  return {
    content: [{ type: "text", text: `${JSON.stringify(emergencyEnvelope, null, 2)}\n` }],
    details: {
      compactEnvelope: emergencyEnvelope,
      originalDetailsOmitted: event.details !== undefined,
      emergencyCompaction: true,
    },
    isError: event.isError,
  };
}

export function compactToolResultEvent(event: ToolResultEvent, options: CompactOptions = {}) {
  const envelope = buildCompactToolResultEnvelope(event, options);
  if (!envelope) return undefined;
  return toolResultReplacement(envelope, event, options);
}


export default function toolResultEnvelope(pi: ExtensionAPI) {
  const startedAtByToolCallId = new Map<string, number>();

  pi.on("tool_execution_start", (event) => {
    startedAtByToolCallId.set(event.toolCallId, Date.now());
  });

  pi.on("tool_execution_end", (event) => {
    startedAtByToolCallId.delete(event.toolCallId);
  });

  (pi as any).on("tool_result", (event: ToolResultEvent) => {
    return compactToolResultEvent(event, {
      startedAtMs: startedAtByToolCallId.get(event.toolCallId),
    });
  });
}
