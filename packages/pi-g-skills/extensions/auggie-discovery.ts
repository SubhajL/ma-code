import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Type } from "@sinclair/typebox";
import { runSpawn, truncateText } from "./lib/process-utils.js";

const AuggieDiscoverSchema = Type.Object({
  question: Type.String({ description: "Natural-language codebase discovery question." }),
  maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 250, maximum: 10000 })),
});

type AuggieMode = "http" | "command" | "unconfigured";

interface AuggieConfig {
  mode: AuggieMode;
  timeoutMs: number;
  url?: string;
  command?: string;
  source: "env-url" | "env-command" | "packaged-bridge" | "unconfigured";
}

interface DiscoveryResult {
  summary: string;
  files: string[];
  patterns: string[];
  notes: string[];
  fallbackRecommended: boolean;
  mode: AuggieMode;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `"'"'`)}'`;
}

function detectAuggieCliCommand(): string | undefined {
  const configured = process.env.AUGGIE_CLI_COMMAND?.trim();
  if (configured) return configured;

  const candidates = ["/opt/homebrew/bin/auggie", "/usr/local/bin/auggie"];
  return candidates.find((candidate) => existsSync(candidate));
}

function packagedBridgePath(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(here, "bin/auggie-discovery-bridge.py");
  return existsSync(candidate) ? candidate : undefined;
}

function getAuggieConfig(): AuggieConfig {
  const timeoutMs = Number(process.env.AUGGIE_DISCOVERY_TIMEOUT_MS ?? "2000");
  const url = process.env.AUGGIE_DISCOVERY_URL?.trim();
  const command = process.env.AUGGIE_DISCOVERY_COMMAND?.trim();

  if (url) return { mode: "http", timeoutMs, url, source: "env-url" };
  if (command) return { mode: "command", timeoutMs, command, source: "env-command" };

  const bridgePath = packagedBridgePath();
  if (bridgePath) {
    const cliCommand = detectAuggieCliCommand();
    const autoCommand = cliCommand
      ? `AUGGIE_CLI_COMMAND=${shellQuote(cliCommand)} python3 ${shellQuote(bridgePath)}`
      : `python3 ${shellQuote(bridgePath)}`;
    return { mode: "command", timeoutMs, command: autoCommand, source: "packaged-bridge" };
  }

  return { mode: "unconfigured", timeoutMs, source: "unconfigured" };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
}

function normalizeDiscoveryPayload(payload: unknown, mode: AuggieMode): DiscoveryResult {
  if (!payload || typeof payload !== "object") {
    return {
      summary: typeof payload === "string" ? payload : "Auggie returned an unstructured response.",
      files: [],
      patterns: [],
      notes: [],
      fallbackRecommended: false,
      mode,
    };
  }

  const input = payload as Record<string, unknown>;
  const summary =
    typeof input.summary === "string"
      ? input.summary
      : typeof input.result === "string"
        ? input.result
        : typeof input.text === "string"
          ? input.text
          : "Auggie returned no summary.";

  return {
    summary,
    files: asStringArray(input.files),
    patterns: asStringArray(input.patterns),
    notes: asStringArray(input.notes),
    fallbackRecommended: Boolean(input.fallbackRecommended ?? false),
    mode,
  };
}

function formatDiscovery(result: DiscoveryResult): string {
  const lines: string[] = [];
  lines.push(`Discovery mode: ${result.mode}`);
  lines.push("");
  lines.push("Summary:");
  lines.push(`- ${result.summary}`);

  lines.push("");
  lines.push("Relevant Files:");
  if (result.files.length === 0) lines.push("- none reported");
  else result.files.forEach((file) => lines.push(`- ${file}`));

  lines.push("");
  lines.push("Patterns:");
  if (result.patterns.length === 0) lines.push("- none reported");
  else result.patterns.forEach((pattern) => lines.push(`- ${pattern}`));

  lines.push("");
  lines.push("Notes:");
  if (result.notes.length === 0) lines.push("- none");
  else result.notes.forEach((note) => lines.push(`- ${note}`));

  if (result.fallbackRecommended) {
    lines.push("");
    lines.push("Fallback:");
    lines.push("- use local discovery tools: read, grep/rg, find, and targeted file inspection");
  }

  return truncateText(lines.join("\n"));
}

async function callAuggieHttp(
  config: AuggieConfig,
  question: string,
  maxResults: number,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<DiscoveryResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const response = await fetch(config.url!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, maxResults }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        summary: `Auggie HTTP bridge returned ${response.status}.`,
        files: [],
        patterns: [],
        notes: ["Use local discovery fallback."],
        fallbackRecommended: true,
        mode: config.mode,
      };
    }

    const payload = await response.json();
    return normalizeDiscoveryPayload(payload, config.mode);
  } catch (error) {
    const reason = controller.signal.aborted ? "Auggie HTTP request timed out or was aborted." : `Auggie HTTP error: ${String(error)}`;
    return {
      summary: reason,
      files: [],
      patterns: [],
      notes: ["Use local discovery fallback."],
      fallbackRecommended: true,
      mode: config.mode,
    };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

async function callAuggieCommand(
  config: AuggieConfig,
  question: string,
  maxResults: number,
  timeoutMs: number,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<DiscoveryResult> {
  try {
    const payload = JSON.stringify({ question, maxResults });
    const result = await runSpawn("bash", ["-lc", config.command!], {
      cwd,
      input: payload,
      timeoutMs,
      signal,
    });

    if (result.timedOut) {
      return {
        summary: "Auggie command timed out.",
        files: [],
        patterns: [],
        notes: ["Use local discovery fallback."],
        fallbackRecommended: true,
        mode: config.mode,
      };
    }

    if (result.code !== 0) {
      return {
        summary: `Auggie command failed with exit code ${result.code ?? -1}.`,
        files: [],
        patterns: [],
        notes: [truncateText(result.stderr || "Use local discovery fallback.", 600)],
        fallbackRecommended: true,
        mode: config.mode,
      };
    }

    const trimmed = result.stdout.trim();
    if (!trimmed) {
      return {
        summary: "Auggie command returned no output.",
        files: [],
        patterns: [],
        notes: ["Use local discovery fallback."],
        fallbackRecommended: true,
        mode: config.mode,
      };
    }

    try {
      return normalizeDiscoveryPayload(JSON.parse(trimmed), config.mode);
    } catch {
      return {
        summary: truncateText(trimmed, 4000),
        files: [],
        patterns: [],
        notes: [],
        fallbackRecommended: false,
        mode: config.mode,
      };
    }
  } catch (error) {
    return {
      summary: `Auggie command error: ${String(error)}`,
      files: [],
      patterns: [],
      notes: ["Use local discovery fallback."],
      fallbackRecommended: true,
      mode: config.mode,
    };
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "auggie_discover",
    label: "Auggie Discover",
    description: "Semantic codebase discovery via an external Auggie bridge with bounded fallback guidance.",
    promptSnippet: "Use semantic codebase discovery before broad local searching when available.",
    promptGuidelines: [
      "Use this tool for semantic repo discovery first when the question is about likely code locations, existing patterns, or runtime entry points.",
      "If this tool reports fallbackRecommended, continue with local discovery using read, grep/rg, find, and targeted file inspection.",
    ],
    parameters: AuggieDiscoverSchema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const config = getAuggieConfig();
      const timeoutMs = params.timeoutMs ?? config.timeoutMs;
      const maxResults = params.maxResults ?? 8;

      let discovery: DiscoveryResult;
      if (config.mode === "http") {
        discovery = await callAuggieHttp(config, params.question, maxResults, timeoutMs, signal);
      } else if (config.mode === "command") {
        discovery = await callAuggieCommand(config, params.question, maxResults, timeoutMs, ctx.cwd, signal);
      } else {
        discovery = {
          summary: "Auggie is not configured for this Pi package.",
          files: [],
          patterns: [],
          notes: [
            "Set AUGGIE_DISCOVERY_URL or AUGGIE_DISCOVERY_COMMAND, or keep the packaged bridge available.",
          ],
          fallbackRecommended: true,
          mode: "unconfigured",
        };
      }

      return {
        content: [{ type: "text", text: formatDiscovery(discovery) }],
        details: {
          mode: discovery.mode,
          fallbackRecommended: discovery.fallbackRecommended,
          files: discovery.files,
          patterns: discovery.patterns,
          timeoutMs,
          source: config.source,
        },
      };
    },
  });

  pi.registerCommand("auggie-status", {
    description: "Show Auggie discovery configuration status.",
    handler: async (_args, ctx) => {
      const config = getAuggieConfig();
      const summary =
        config.mode === "http"
          ? `Auggie mode=http source=${config.source} timeoutMs=${config.timeoutMs} url=${config.url}`
          : config.mode === "command"
            ? `Auggie mode=command source=${config.source} timeoutMs=${config.timeoutMs}`
            : `Auggie mode=unconfigured source=${config.source} timeoutMs=${config.timeoutMs}`;
      ctx.ui.notify(summary, "info");
    },
  });
}
