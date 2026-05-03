import { AgentSessionRuntime } from "@mariozechner/pi-coding-agent";

type RuntimeWithSession = AgentSessionRuntime & {
  session: {
    model?: unknown;
    thinkingLevel?: unknown;
    scopedModels?: Array<{ model: unknown; thinkingLevel?: unknown }>;
    setModel?: (model: unknown) => Promise<boolean>;
    setThinkingLevel?: (level: unknown) => void;
    setScopedModels?: (scopedModels: Array<{ model: unknown; thinkingLevel?: unknown }>) => void;
  };
};

type NewSessionOptions = {
  parentSession?: string;
  setup?: (sessionManager: unknown) => Promise<void>;
  withSession?: (ctx: unknown) => Promise<void>;
} & Record<string, unknown>;
type NewSessionResult = Awaited<ReturnType<AgentSessionRuntime["newSession"]>>;

type PatchedPrototype = AgentSessionRuntime & {
  __piNewSessionPersistencePatched?: boolean;
};

function copyScopedModels(scopedModels: RuntimeWithSession["session"]["scopedModels"]) {
  return (scopedModels ?? []).map((scoped) => ({
    model: scoped.model,
    thinkingLevel: scoped.thinkingLevel,
  }));
}

export function installNewSessionPersistencePatch() {
  const prototype = AgentSessionRuntime.prototype as PatchedPrototype;
  if (prototype.__piNewSessionPersistencePatched === true) {
    return false;
  }

  const originalNewSession = AgentSessionRuntime.prototype.newSession;

  AgentSessionRuntime.prototype.newSession = async function patchedNewSession(
    this: RuntimeWithSession,
    options?: NewSessionOptions,
  ): Promise<NewSessionResult> {
    const runtime = this;
    const preservedModel = runtime.session.model;
    const preservedThinkingLevel = runtime.session.thinkingLevel;
    const preservedScopedModels = copyScopedModels(runtime.session.scopedModels);
    const originalWithSession = options?.withSession;

    return originalNewSession.call(runtime, {
      ...options,
      async withSession(ctx) {
        if (preservedScopedModels.length > 0) {
          runtime.session.setScopedModels?.(preservedScopedModels);
        }
        if (preservedModel) {
          await runtime.session.setModel?.(preservedModel);
        }
        if (preservedThinkingLevel) {
          runtime.session.setThinkingLevel?.(preservedThinkingLevel);
        }
        await originalWithSession?.(ctx);
      },
    });
  } as AgentSessionRuntime["newSession"];

  prototype.__piNewSessionPersistencePatched = true;
  return true;
}

installNewSessionPersistencePatch();

export default function newSessionPersistence() {
  installNewSessionPersistencePatch();
}
