import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runSpawn, truncateText } from "./lib/process-utils.js";

const SecondModelPlanSchema = Type.Object({
  goal: Type.String({ description: "Planning goal or task statement." }),
  contextSummary: Type.Optional(Type.String({ description: "Optional repo/context summary for the second model." })),
  primaryPlan: Type.Optional(Type.String({ description: "Optional primary plan draft to review and preserve on fallback." })),
  constraints: Type.Optional(Type.Array(Type.String())),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 5000, maximum: 180000 })),
});

interface ModelLike {
  provider: string;
  id: string;
}

function modelKey(model: ModelLike): string {
  return `${model.provider}/${model.id}`;
}

export function isAnyOpus(model: ModelLike): boolean {
  return model.provider.toLowerCase() === "anthropic" && /^claude-opus-4-\d+$/i.test(model.id);
}

export async function readStrongReasoningOpusCandidates(cwd: string): Promise<string[]> {
  try {
    const raw = await readFile(resolve(cwd, ".pi/agent/models.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return [];
    const caps = (parsed as { capabilities?: unknown }).capabilities;
    if (typeof caps !== "object" || caps === null) return [];
    const strong = (caps as Record<string, unknown>).strong_reasoning;
    if (typeof strong !== "object" || strong === null) return [];
    const ids = (strong as { model_ids?: unknown }).model_ids;
    if (!Array.isArray(ids)) return [];
    return ids.filter(
      (id): id is string =>
        typeof id === "string" && /^anthropic\/claude-opus-4-\d+$/i.test(id),
    );
  } catch {
    return [];
  }
}

export function selectSecondModel(
  available: ModelLike[],
  currentKey: string | null,
  capabilityOpusIds: string[],
): ModelLike | null {
  for (const fullId of capabilityOpusIds) {
    const match = available.find(
      (model) => modelKey(model) === fullId && modelKey(model) !== currentKey,
    );
    if (match) return match;
  }
  return available.find((model) => isAnyOpus(model) && modelKey(model) !== currentKey) ?? null;
}

function buildPlanningPrompt(input: {
  goal: string;
  contextSummary?: string;
  primaryPlan?: string;
  constraints?: string[];
  selectedModelKey: string;
}): string {
  const sections: string[] = [];
  sections.push("You are a skeptical second planning model for a Pi-based coding workflow.");
  sections.push("Review the request, critique the draft plan if provided, and return one unified implementation plan.");
  sections.push("");
  sections.push("Requirements:");
  sections.push("- stay bounded");
  sections.push("- preserve TDD-first sequencing");
  sections.push("- call out wiring or registration checks for new runtime components");
  sections.push("- if the primary plan is weak, fix it rather than echoing it");
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
  sections.push("## TDD Sequence");
  sections.push("## Test Coverage");
  sections.push("## Acceptance Criteria");
  sections.push("## Wiring Checks");
  sections.push("## Risks");
  sections.push("## Validation");
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
      return { ok: false, text: "", reason: "second-model planning timed out" };
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

function formatFallback(primaryPlan: string | undefined, reason: string, currentModelKey: string | null): string {
  const lines: string[] = [];
  lines.push("## Second-Model Review");
  lines.push(`- unavailable: ${reason}`);
  lines.push("");
  lines.push("## Unified Plan");
  lines.push(`- fallback to the main/current model${currentModelKey ? ` (${currentModelKey})` : ""}`);
  if (primaryPlan?.trim()) {
    lines.push("- preserved the primary plan draft because no eligible Anthropic Opus second lane completed");
    lines.push("");
    lines.push(primaryPlan.trim());
  } else {
    lines.push("- no second-model output available; continue planning with the main/current model and state that fallback occurred explicitly");
  }
  return truncateText(lines.join("\n"), 14000);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "second_model_plan",
    label: "Second Model Plan",
    description: "Request a second planning pass from Claude Opus only (any verified 4.x), with explicit fallback to the main model if unavailable.",
    promptSnippet: "Request a second planning pass from Claude Opus only, and fall back explicitly to the main model otherwise.",
    promptGuidelines: [
      "Use this tool for medium- or high-risk planning when a second planning opinion is valuable.",
      "This package intentionally restricts the second-model lane to Claude Opus only (any 4.x version available).",
      "Preferred Opus order is read from the consumer's `.pi/agent/models.json` `strong_reasoning` capability when present; otherwise any available Anthropic Opus 4.x is acceptable.",
      "If the tool reports fallback, continue with the main/current model and state the fallback explicitly.",
    ],
    parameters: SecondModelPlanSchema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const availableModels = ((await ctx.modelRegistry.getAvailable()) as ModelLike[]).filter(
        (model) => typeof model.provider === "string" && typeof model.id === "string",
      );
      const currentKey = ctx.model ? modelKey(ctx.model as ModelLike) : null;
      const capabilityOpusIds = await readStrongReasoningOpusCandidates(ctx.cwd);
      const candidate = selectSecondModel(availableModels, currentKey, capabilityOpusIds);

      if (!candidate) {
        const reason = currentKey && isAnyOpus({ provider: currentKey.split("/")[0] ?? "", id: currentKey.split("/")[1] ?? "" })
          ? "current model is already an Anthropic Opus 4.x, so no separate second-model lane exists"
          : "no Anthropic Opus 4.x model is available in the current Pi model registry";
        return {
          content: [{ type: "text", text: formatFallback(params.primaryPlan, reason, currentKey) }],
          details: {
            ok: false,
            fallback: true,
            reason,
            selectedModel: null,
            currentModel: currentKey,
            capabilityOpusIds,
          },
        };
      }

      const selectedModelKey = modelKey(candidate);
      const timeoutMs = params.timeoutMs ?? 45000;
      const prompt = buildPlanningPrompt({
        goal: params.goal,
        contextSummary: params.contextSummary,
        primaryPlan: params.primaryPlan,
        constraints: params.constraints,
        selectedModelKey,
      });

      const secondPass = await runSecondModelPlan(ctx.cwd, selectedModelKey, prompt, timeoutMs, signal);
      if (!secondPass.ok) {
        return {
          content: [{ type: "text", text: formatFallback(params.primaryPlan, secondPass.reason ?? "unknown failure", currentKey) }],
          details: {
            ok: false,
            fallback: true,
            reason: secondPass.reason,
            selectedModel: selectedModelKey,
            currentModel: currentKey,
            timeoutMs,
            capabilityOpusIds,
          },
        };
      }

      return {
        content: [{ type: "text", text: secondPass.text }],
        details: {
          ok: true,
          fallback: false,
          selectedModel: selectedModelKey,
          currentModel: currentKey,
          timeoutMs,
          capabilityOpusIds,
        },
      };
    },
  });
}
