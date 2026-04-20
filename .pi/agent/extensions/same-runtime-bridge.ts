import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  createAgentSession,
  createCodingTools,
  createReadOnlyTools,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";

export const PROBE_TOOL_PROFILES = ["none", "read_only", "coding"] as const;
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export const AUTH_SOURCE_CLASSES = [
  "auth_storage_oauth",
  "auth_storage_api_key",
  "configured_external_or_runtime",
  "missing",
] as const;

export type ProbeToolProfile = (typeof PROBE_TOOL_PROFILES)[number];
export type AuthSourceClass = (typeof AUTH_SOURCE_CLASSES)[number];

export interface AuthSourceInfo {
  provider: string;
  sourceClass: AuthSourceClass;
  storedCredentialType: "oauth" | "api_key" | null;
  oauthBacked: boolean;
  configured: boolean;
}

export interface SameRuntimeProbeInput {
  prompt: string;
  provider?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
  toolProfile?: ProbeToolProfile;
  includeProjectExtensions?: boolean;
  includeContextFiles?: boolean;
  cwd?: string;
}

export interface SameRuntimeProbeResult {
  prompt: string;
  usedStandalonePi: false;
  inheritedParentModel: boolean;
  provider: string;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  authSource: AuthSourceInfo;
  toolProfile: ProbeToolProfile;
  includeProjectExtensions: boolean;
  includeContextFiles: boolean;
  cwd: string;
  childSessionId: string;
  responseText: string;
  assistantError: string | null;
}

interface ProbeToolDetails {
  ok: boolean;
  result: SameRuntimeProbeResult | null;
  error: string | null;
}

const RunSameRuntimeProbeSchema = Type.Object({
  prompt: Type.String({ minLength: 1 }),
  provider: Type.Optional(Type.String({ minLength: 1 })),
  modelId: Type.Optional(Type.String({ minLength: 1 })),
  thinkingLevel: Type.Optional(StringEnum(THINKING_LEVELS)),
  toolProfile: Type.Optional(StringEnum(PROBE_TOOL_PROFILES)),
  includeProjectExtensions: Type.Optional(Type.Boolean()),
  includeContextFiles: Type.Optional(Type.Boolean()),
  cwd: Type.Optional(Type.String({ minLength: 1 })),
});

function normalizeCwd(cwd: string | undefined, fallback: string): string {
  if (!cwd || cwd.trim().length === 0) return fallback;
  return cwd.trim();
}

export function resolveProbeModel(
  currentModel: Model<any> | undefined,
  modelRegistry: { find(provider: string, modelId: string): Model<any> | undefined },
  provider?: string,
  modelId?: string,
): { model: Model<any>; inheritedParentModel: boolean } {
  if (!currentModel && !modelId) {
    throw new Error("No current model is available and no model override was provided.");
  }

  const effectiveProvider = provider ?? currentModel?.provider;
  const effectiveModelId = modelId ?? currentModel?.id;
  if (!effectiveProvider || !effectiveModelId) {
    throw new Error("Unable to resolve provider/model for same-runtime probe.");
  }

  const resolved = modelRegistry.find(effectiveProvider, effectiveModelId);
  if (!resolved) {
    throw new Error(`Model not found in shared registry: ${effectiveProvider}/${effectiveModelId}`);
  }

  const inheritedParentModel = !!currentModel && resolved.provider === currentModel.provider && resolved.id === currentModel.id;
  return { model: resolved, inheritedParentModel };
}

export function classifyAuthSource(
  modelRegistry: {
    authStorage: {
      get(provider: string): { type: "oauth" | "api_key" } | undefined;
    };
    hasConfiguredAuth(model: Model<any>): boolean;
    isUsingOAuth(model: Model<any>): boolean;
  },
  model: Model<any>,
): AuthSourceInfo {
  const stored = modelRegistry.authStorage.get(model.provider);
  if (stored?.type === "oauth") {
    return {
      provider: model.provider,
      sourceClass: "auth_storage_oauth",
      storedCredentialType: "oauth",
      oauthBacked: true,
      configured: true,
    };
  }
  if (stored?.type === "api_key") {
    return {
      provider: model.provider,
      sourceClass: "auth_storage_api_key",
      storedCredentialType: "api_key",
      oauthBacked: false,
      configured: true,
    };
  }
  const configured = modelRegistry.hasConfiguredAuth(model);
  if (configured) {
    return {
      provider: model.provider,
      sourceClass: "configured_external_or_runtime",
      storedCredentialType: null,
      oauthBacked: modelRegistry.isUsingOAuth(model),
      configured: true,
    };
  }
  return {
    provider: model.provider,
    sourceClass: "missing",
    storedCredentialType: null,
    oauthBacked: false,
    configured: false,
  };
}

function extractAssistantText(messages: Array<{ role: string; content?: Array<{ type?: string; text?: string }>; errorMessage?: string }>): {
  responseText: string;
  assistantError: string | null;
} {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const responseText = (message.content ?? [])
      .filter((part): part is { type: string; text: string } => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
    const assistantError = typeof message.errorMessage === "string" ? message.errorMessage : null;
    return { responseText, assistantError };
  }
  return { responseText: "", assistantError: null };
}

function resolveTools(cwd: string, profile: ProbeToolProfile) {
  if (profile === "none") return [];
  if (profile === "read_only") return createReadOnlyTools(cwd);
  return createCodingTools(cwd);
}

export async function runSameRuntimeProbe(
  parentCtx: {
    cwd: string;
    model: Model<any> | undefined;
    modelRegistry: {
      authStorage: any;
      find(provider: string, modelId: string): Model<any> | undefined;
      hasConfiguredAuth(model: Model<any>): boolean;
      isUsingOAuth(model: Model<any>): boolean;
    };
  },
  input: SameRuntimeProbeInput,
  currentThinkingLevel: ThinkingLevel,
): Promise<SameRuntimeProbeResult> {
  const probeCwd = normalizeCwd(input.cwd, parentCtx.cwd);
  const { model, inheritedParentModel } = resolveProbeModel(parentCtx.model, parentCtx.modelRegistry, input.provider, input.modelId);
  const authSource = classifyAuthSource(parentCtx.modelRegistry, model);
  if (!authSource.configured) {
    throw new Error(`No configured auth is available for ${model.provider}/${model.id}.`);
  }

  const toolProfile = input.toolProfile ?? "none";
  const includeProjectExtensions = input.includeProjectExtensions ?? false;
  const includeContextFiles = input.includeContextFiles ?? true;
  const thinkingLevel = input.thinkingLevel ?? currentThinkingLevel;
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(probeCwd, agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: probeCwd,
    agentDir,
    settingsManager,
    noExtensions: !includeProjectExtensions,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: !includeContextFiles,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: probeCwd,
    agentDir,
    authStorage: parentCtx.modelRegistry.authStorage,
    modelRegistry: parentCtx.modelRegistry as any,
    model,
    thinkingLevel,
    tools: resolveTools(probeCwd, toolProfile),
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    settingsManager,
  });

  try {
    await session.prompt(input.prompt, { source: "extension" });
    const { responseText, assistantError } = extractAssistantText(session.messages as any);
    return {
      prompt: input.prompt,
      usedStandalonePi: false,
      inheritedParentModel,
      provider: model.provider,
      modelId: model.id,
      thinkingLevel,
      authSource,
      toolProfile,
      includeProjectExtensions,
      includeContextFiles,
      cwd: probeCwd,
      childSessionId: session.sessionId,
      responseText,
      assistantError,
    };
  } finally {
    session.dispose();
  }
}

export default function sameRuntimeBridge(pi: ExtensionAPI) {
  pi.registerTool({
    name: "run_same_runtime_probe",
    label: "Run Same-Runtime Probe",
    description: "Run a bounded child probe using the parent Pi runtime's shared model registry and auth storage instead of standalone pi.",
    promptSnippet: "Use this tool for bounded live probes that should stay on the parent runtime's account/model path.",
    promptGuidelines: [
      "Use this tool instead of shelling out to standalone pi when a live probe should reuse the parent runtime's shared model/account path.",
      "Prefer the default inherited model unless you explicitly need a bounded provider/model override present in the shared registry.",
    ],
    parameters: RunSameRuntimeProbeSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const result = await runSameRuntimeProbe(
          {
            cwd: ctx.cwd,
            model: ctx.model,
            modelRegistry: ctx.modelRegistry as any,
          },
          params,
          pi.getThinkingLevel(),
        );
        const details: ProbeToolDetails = { ok: true, result, error: null };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details,
        };
      } catch (error) {
        const details: ProbeToolDetails = {
          ok: false,
          result: null,
          error: String(error),
        };
        return {
          content: [{ type: "text", text: `Same-runtime probe failed: ${String(error)}` }],
          details,
        };
      }
    },
  });
}
