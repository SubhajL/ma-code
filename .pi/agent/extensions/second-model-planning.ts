import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { runSpawn, truncateText } from "./lib/process-utils.js";

const SecondModelPlanSchema = Type.Object({
  goal: Type.String({ description: "Planning goal or task statement." }),
  contextSummary: Type.Optional(Type.String({ description: "Optional repo/context summary for the second model." })),
  primaryPlan: Type.Optional(Type.String({ description: "Optional primary plan draft to review and unify." })),
  constraints: Type.Optional(Type.Array(Type.String())),
  preferredModels: Type.Optional(Type.Array(Type.String())),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 5000, maximum: 180000 })),
});

interface ModelLike {
  provider: string;
  id: string;
}

function modelKey(model: ModelLike): string {
  return `${model.provider}/${model.id}`;
}

function matchesExact(model: ModelLike, key: string): boolean {
  return modelKey(model) === key;
}

function matchesProviderHint(model: ModelLike, hint: RegExp): boolean {
  return hint.test(model.provider) || hint.test(model.id);
}

function matchesPreference(model: ModelLike, preference: string): boolean {
  const normalized = preference.trim().toLowerCase();
  if (!normalized) return false;

  const fullKey = modelKey(model).toLowerCase();
  if (fullKey === normalized) return true;
  if (!normalized.includes("/")) {
    return model.provider.toLowerCase().includes(normalized) || model.id.toLowerCase().includes(normalized);
  }

  return fullKey.includes(normalized);
}

async function readPlanningLaneOverrides(cwd: string): Promise<string[]> {
  try {
    const raw = await readFile(resolve(cwd, ".pi/agent/models.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      routing_defaults?: {
        planning_lead?: {
          allowed_overrides?: unknown;
        };
      };
    };

    const overrides = parsed.routing_defaults?.planning_lead?.allowed_overrides;
    if (!Array.isArray(overrides)) return [];
    return overrides.map((item) => String(item).trim()).filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

interface OperatorModelHints {
  codexConfigPath: string;
  hasGeminiMcp: boolean;
  preferredModels: string[];
}

async function readOperatorModelHints(): Promise<OperatorModelHints> {
  const codexConfigPath = resolve(homedir(), ".codex/config.toml");

  try {
    const raw = await readFile(codexConfigPath, "utf8");
    const preferredModels: string[] = [];
    if (/\[mcp_servers\.gemini\]/.test(raw)) {
      preferredModels.push("google/gemini-2.5-flash", "google/gemini-2.5-pro");
    }

    const defaultModelMatch = raw.match(/^model\s*=\s*"([^"]+)"/m);
    if (defaultModelMatch?.[1] && !defaultModelMatch[1].includes("/")) {
      preferredModels.push(`openai-codex/${defaultModelMatch[1]}`);
      preferredModels.push(`github-copilot/${defaultModelMatch[1]}`);
    }

    return {
      codexConfigPath,
      hasGeminiMcp: /\[mcp_servers\.gemini\]/.test(raw),
      preferredModels,
    };
  } catch {
    return {
      codexConfigPath,
      hasGeminiMcp: false,
      preferredModels: [],
    };
  }
}

function orderedSecondaryCandidates(
  available: ModelLike[],
  currentKey: string | null,
  preferred: string[] | undefined,
  repoPlanningOverrides: string[],
  operatorHints: OperatorModelHints,
): ModelLike[] {
  const candidates: ModelLike[] = [];
  const seen = new Set<string>();
  const maybeAdd = (model: ModelLike | undefined) => {
    if (!model) return;
    const key = modelKey(model);
    if (key === currentKey || seen.has(key)) return;
    seen.add(key);
    candidates.push(model);
  };

  const maybeAddByPreference = (preference: string) => {
    maybeAdd(available.find((model) => matchesExact(model, preference)));
    maybeAdd(available.find((model) => matchesPreference(model, preference)));
  };

  for (const preference of preferred ?? []) {
    maybeAddByPreference(preference);
  }

  const boundedDefaults = [
    "anthropic/claude-opus-4-6",
    "anthropic/claude-opus-4-5",
    ...repoPlanningOverrides,
    "github-copilot/claude-opus-4.6",
    "github-copilot/claude-opus-4.5",
    "github-copilot/claude-sonnet-4.6",
  ];
  for (const preference of boundedDefaults) {
    maybeAddByPreference(preference);
  }

  for (const preference of operatorHints.preferredModels) {
    maybeAddByPreference(preference);
  }

  if (operatorHints.hasGeminiMcp) {
    maybeAddByPreference("google/gemini-2.5-flash");
    maybeAddByPreference("google/gemini-2.5-pro");
  }

  maybeAddByPreference("openai-codex/gpt-5.4-mini");
  maybeAdd(available.find((model) => matchesProviderHint(model, /^google$/i) && /gemini-2\.5-(flash|pro)/i.test(model.id)));
  maybeAdd(
    available.find(
      (model) => matchesProviderHint(model, /^google$/i) && /gemini-(2\.5|3(?:\.|-))|gemini-(flash|flash-lite)-latest/i.test(model.id),
    ),
  );
  maybeAdd(
    available.find(
      (model) =>
        /github|copilot/i.test(model.provider) &&
        /(claude-opus-4\.6|claude-opus-4\.5|claude-sonnet-4\.6|gpt-5(?:\.|-|$)|gpt-5\.4)/i.test(model.id),
    ),
  );
  maybeAdd(
    available.find(
      (model) => /github|copilot/i.test(model.provider) && /(gemini-2\.5-pro|gpt-5(?:\.|-|$))/i.test(model.id),
    ),
  );

  return candidates;
}

function buildPlanningPrompt(input: {
  goal: string;
  contextSummary?: string;
  primaryPlan?: string;
  constraints?: string[];
  selectedModelKey: string;
}): string {
  const sections: string[] = [];
  sections.push("You are a skeptical second planning model for a Pi-based coding harness.");
  sections.push("Review the request, critique the draft plan if provided, and return one unified implementation plan.");
  sections.push("");
  sections.push("Requirements:");
  sections.push("- stay bounded");
  sections.push("- prefer specific files and validation ideas");
  sections.push("- call out wiring or registration checks for new runtime components");
  sections.push("- if the primary plan is weak, fix it rather than politely echoing it");
  sections.push("");
  sections.push(`Secondary model: ${input.selectedModelKey}`);
  sections.push("");
  sections.push("Goal:");
  sections.push(input.goal);

  if (input.contextSummary) {
    sections.push("");
    sections.push("Context Summary:");
    sections.push(input.contextSummary);
  }

  if (input.primaryPlan) {
    sections.push("");
    sections.push("Primary Plan Draft:");
    sections.push(input.primaryPlan);
  }

  if (input.constraints && input.constraints.length > 0) {
    sections.push("");
    sections.push("Constraints:");
    input.constraints.forEach((constraint) => sections.push(`- ${constraint}`));
  }

  sections.push("");
  sections.push("Return exactly these sections:");
  sections.push("## Second-Model Review");
  sections.push("## Unified Plan");
  sections.push("## Files to Modify");
  sections.push("## New Files");
  sections.push("## Acceptance Criteria");
  sections.push("## Wiring Checks");
  sections.push("## Risks");
  sections.push("## Validation Ideas");
  sections.push("");
  sections.push("Use bullets, not long prose.");

  return sections.join("\n");
}

async function runSecondModelPlan(
  cwd: string,
  selectedModelKey: string,
  prompt: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<{ ok: boolean; text: string; reason?: string }> {
  try {
    const result = await runSpawn(
      "pi",
      [
        "--no-session",
        "--no-extensions",
        "--tools",
        "read,grep,find,ls",
        "--model",
        selectedModelKey,
        "--thinking",
        "high",
        "--print",
        prompt,
      ],
      { cwd, timeoutMs, signal },
    );

    if (result.timedOut) {
      return { ok: false, text: "", reason: "second model planning timed out" };
    }

    if (result.code !== 0) {
      return {
        ok: false,
        text: "",
        reason: truncateText(result.stderr || `pi exited with code ${result.code ?? -1}`, 1200),
      };
    }

    const text = result.stdout.trim();
    if (!text) return { ok: false, text: "", reason: "second model returned no output" };
    return { ok: true, text: truncateText(text, 14000) };
  } catch (error) {
    return { ok: false, text: "", reason: `second model invocation error: ${String(error)}` };
  }
}

function formatFallback(primaryPlan: string | undefined, reason: string): string {
  const lines: string[] = [];
  lines.push("## Second-Model Review");
  lines.push(`- unavailable: ${reason}`);
  lines.push("");
  lines.push("## Unified Plan");
  if (primaryPlan?.trim()) {
    lines.push("- fallback to the current model's primary plan draft");
    lines.push("");
    lines.push(primaryPlan.trim());
  } else {
    lines.push("- no second model available; continue with single-model planning and make the fallback explicit in the final plan");
  }
  return truncateText(lines.join("\n"), 14000);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "second_model_plan",
    label: "Second Model Plan",
    description: "Solicit a second planning pass from another available model and return a unified planning artifact with fallback.",
    promptSnippet: "Request a second planning pass from another model and return a unified plan.",
    promptGuidelines: [
      "Use this tool for medium- or high-risk planning after you have a goal and enough context to form a draft plan.",
      "If the tool reports fallback, continue with single-model planning and state that the second model was unavailable.",
    ],
    parameters: SecondModelPlanSchema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const availableModels = ((await ctx.modelRegistry.getAvailable()) as ModelLike[]).filter(
        (model) => typeof model.provider === "string" && typeof model.id === "string",
      );
      const currentKey = ctx.model ? modelKey(ctx.model as ModelLike) : null;
      const repoPlanningOverrides = await readPlanningLaneOverrides(ctx.cwd);
      const operatorHints = await readOperatorModelHints();
      const candidates = orderedSecondaryCandidates(
        availableModels,
        currentKey,
        params.preferredModels,
        repoPlanningOverrides,
        operatorHints,
      );

      if (candidates.length === 0) {
        const reason = "no eligible secondary model is currently available";
        return {
          content: [{ type: "text", text: formatFallback(params.primaryPlan, reason) }],
          details: {
            ok: false,
            fallback: true,
            reason,
            selectedModel: null,
            repoPlanningOverrides,
            operatorHints,
          },
        };
      }

      const timeoutMs = params.timeoutMs ?? 45000;
      const attempted: Array<{ model: string; reason: string | undefined }> = [];

      for (const candidate of candidates) {
        const selectedModelKey = modelKey(candidate);
        const prompt = buildPlanningPrompt({
          goal: params.goal,
          contextSummary: params.contextSummary,
          primaryPlan: params.primaryPlan,
          constraints: params.constraints,
          selectedModelKey,
        });

        const secondPass = await runSecondModelPlan(ctx.cwd, selectedModelKey, prompt, timeoutMs, signal);
        if (secondPass.ok) {
          return {
            content: [{ type: "text", text: secondPass.text }],
            details: {
              ok: true,
              fallback: false,
              selectedModel: selectedModelKey,
              timeoutMs,
              attempted,
              repoPlanningOverrides,
              operatorHints,
            },
          };
        }

        attempted.push({ model: selectedModelKey, reason: secondPass.reason });
      }

      const reason = attempted
        .map((item) => `${item.model}: ${item.reason ?? "unavailable"}`)
        .join(" | ");

      return {
        content: [{ type: "text", text: formatFallback(params.primaryPlan, reason) }],
        details: {
          ok: false,
          fallback: true,
          reason,
          selectedModel: null,
          attempted,
          repoPlanningOverrides,
          operatorHints,
        },
      };
    },
  });
}
