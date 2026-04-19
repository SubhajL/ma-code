import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type TaskStatus = "queued" | "in_progress" | "review" | "blocked" | "done" | "failed";

interface TaskRecord {
  id: string;
  title: string;
  owner: string | null;
  status: TaskStatus;
  acceptance: string[];
  evidence: string[];
  dependencies?: string[];
  retryCount?: number;
  notes: string[];
  timestamps: {
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
  };
}

interface TaskState {
  version: 1;
  activeTaskId: string | null;
  tasks: TaskRecord[];
}

const TASKS_FILE = ".pi/agent/state/runtime/tasks.json";
const AUDIT_LOG = "logs/harness-actions.jsonl";

const TaskUpdateSchema = Type.Object({
  action: StringEnum([
    "show",
    "create",
    "claim",
    "start",
    "note",
    "evidence",
    "review",
    "requeue",
    "block",
    "done",
    "fail",
  ] as const),
  id: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  owner: Type.Optional(Type.String()),
  acceptance: Type.Optional(Type.Array(Type.String())),
  dependencies: Type.Optional(Type.Array(Type.String())),
  evidence: Type.Optional(Type.Array(Type.String())),
  note: Type.Optional(Type.String()),
});

function nowIso(): string {
  return new Date().toISOString();
}

function makeTaskId(): string {
  return `task-${Date.now()}`;
}

function isMutatingBash(command: string): boolean {
  return [
    /\brm\b/i,
    /\bmv\b/i,
    /\bcp\b/i,
    /\btouch\b/i,
    /\bmkdir\b/i,
    /\btee\b/i,
    />/,
    /\bsed\s+-i\b/i,
    /\bperl\s+-i\b/i,
    /\bgit\s+(add|commit|merge|rebase|cherry-pick|reset|restore|clean|checkout|switch|push)\b/i,
  ].some((pattern) => pattern.test(command));
}

async function appendAudit(cwd: string, entry: Record<string, unknown>): Promise<void> {
  const logFile = resolve(cwd, AUDIT_LOG);
  await mkdir(dirname(logFile), { recursive: true });

  await withFileMutationQueue(logFile, async () => {
    await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  });
}

async function ensureTaskFile(cwd: string): Promise<void> {
  const absolute = resolve(cwd, TASKS_FILE);
  await mkdir(dirname(absolute), { recursive: true });

  try {
    await readFile(absolute, "utf8");
  } catch {
    const initial: TaskState = {
      version: 1,
      activeTaskId: null,
      tasks: [],
    };

    await writeFile(absolute, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
  }
}

async function readState(cwd: string): Promise<TaskState> {
  await ensureTaskFile(cwd);
  const absolute = resolve(cwd, TASKS_FILE);
  const raw = await readFile(absolute, "utf8");
  return JSON.parse(raw) as TaskState;
}

async function writeState(cwd: string, state: TaskState): Promise<void> {
  const absolute = resolve(cwd, TASKS_FILE);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function mutateState<T>(cwd: string, fn: (state: TaskState) => T | Promise<T>): Promise<T> {
  const absolute = resolve(cwd, TASKS_FILE);
  await ensureTaskFile(cwd);

  return withFileMutationQueue(absolute, async () => {
    const raw = await readFile(absolute, "utf8");
    const state = JSON.parse(raw) as TaskState;
    const result = await fn(state);
    await writeState(cwd, state);
    return result;
  });
}

function getTask(state: TaskState, id: string): TaskRecord | undefined {
  return state.tasks.find((task) => task.id === id);
}

function getActiveTask(state: TaskState): TaskRecord | undefined {
  return state.activeTaskId ? getTask(state, state.activeTaskId) : undefined;
}

function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  const allowed: Record<TaskStatus, TaskStatus[]> = {
    queued: ["in_progress", "blocked", "failed"],
    in_progress: ["queued", "review", "blocked", "failed"],
    review: ["in_progress", "blocked", "failed", "done"],
    blocked: ["queued", "in_progress", "failed"],
    done: [],
    failed: ["queued", "in_progress"],
  };

  return allowed[from].includes(to);
}

function taskIsRunnable(task: TaskRecord | undefined): boolean {
  return !!task && task.status === "in_progress" && task.acceptance.length > 0 && !!task.owner;
}

function modelIdFromContext(ctx: { model?: { id?: string } | null }): string | null {
  return ctx.model?.id ?? null;
}

function providerFromModelId(modelId: string | null): string | null {
  if (!modelId) return null;
  const slash = modelId.indexOf("/");
  return slash >= 0 ? modelId.slice(0, slash) : null;
}

async function getCurrentBranch(pi: ExtensionAPI, cwd: string): Promise<string | null> {
  const result = await pi.exec("git", ["-C", cwd, "branch", "--show-current"]);
  if (result.code !== 0) return null;
  const branch = result.stdout.trim();
  return branch.length > 0 ? branch : null;
}

function blockingDependenciesForStart(state: TaskState, task: TaskRecord): string[] {
  return (task.dependencies ?? []).filter((dependencyId) => {
    const dependency = getTask(state, dependencyId);
    return !dependency || dependency.status === "blocked" || dependency.status === "failed";
  });
}

function unresolvedDependenciesForDone(state: TaskState, task: TaskRecord): string[] {
  return (task.dependencies ?? []).filter((dependencyId) => {
    const dependency = getTask(state, dependencyId);
    return !dependency || dependency.status !== "done";
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "task_update",
    label: "Task Update",
    description: "Create, claim, start, update, and complete tasks using file-backed JSON state.",
    parameters: TaskUpdateSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await mutateState(ctx.cwd, async (state) => {
        const action = params.action;

        if (action === "show") {
          const active = getActiveTask(state);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    activeTaskId: state.activeTaskId,
                    activeTask: active ?? null,
                    tasks: state.tasks,
                  },
                  null,
                  2,
                ),
              },
            ],
            details: { activeTaskId: state.activeTaskId, taskCount: state.tasks.length },
          };
        }

        if (action === "create") {
          if (!params.title || !params.acceptance || params.acceptance.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "create requires `title` and non-empty `acceptance`.",
                },
              ],
              details: { ok: false },
            };
          }

          const task: TaskRecord = {
            id: params.id ?? makeTaskId(),
            title: params.title,
            owner: params.owner ?? null,
            status: "queued",
            acceptance: params.acceptance,
            evidence: [],
            dependencies: params.dependencies ?? [],
            retryCount: 0,
            notes: [],
            timestamps: {
              createdAt: nowIso(),
              updatedAt: nowIso(),
            },
          };

          state.tasks.push(task);

          return {
            content: [{ type: "text" as const, text: `Created task ${task.id}` }],
            details: { ok: true, task },
          };
        }

        if (!params.id) {
          return {
            content: [{ type: "text" as const, text: `${action} requires \`id\`.` }],
            details: { ok: false },
          };
        }

        const task = getTask(state, params.id);
        if (!task) {
          return {
            content: [{ type: "text" as const, text: `Task not found: ${params.id}` }],
            details: { ok: false },
          };
        }

        if (action === "claim") {
          if (!params.owner) {
            return {
              content: [{ type: "text" as const, text: "claim requires `owner`." }],
              details: { ok: false },
            };
          }

          task.owner = params.owner;
          task.timestamps.updatedAt = nowIso();

          return {
            content: [{ type: "text" as const, text: `Claimed ${task.id} for ${task.owner}` }],
            details: { ok: true, task },
          };
        }

        if (action === "start") {
          const currentActive = getActiveTask(state);
          if (currentActive && currentActive.id !== task.id) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Another active task exists: ${currentActive.id}. Resolve or block it before starting ${task.id}.`,
                },
              ],
              details: { ok: false, activeTaskId: state.activeTaskId },
            };
          }

          if (!canTransition(task.status, "in_progress")) {
            return {
              content: [
                { type: "text" as const, text: `Illegal transition: ${task.status} -> in_progress` },
              ],
              details: { ok: false },
            };
          }

          if (task.acceptance.length === 0) {
            return {
              content: [
                { type: "text" as const, text: "Task cannot start without acceptance criteria." },
              ],
              details: { ok: false },
            };
          }

          if (!task.owner) {
            return {
              content: [{ type: "text" as const, text: "Task cannot start without an owner." }],
              details: { ok: false },
            };
          }

          const blockingDependencies = blockingDependenciesForStart(state, task);
          if (blockingDependencies.length > 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Task cannot start while blocked/failed dependencies remain unresolved: ${blockingDependencies.join(", ")}`,
                },
              ],
              details: { ok: false, blockingDependencies },
            };
          }

          const previousStatus = task.status;
          task.status = "in_progress";
          task.timestamps.startedAt = task.timestamps.startedAt ?? nowIso();
          task.timestamps.updatedAt = nowIso();
          if (previousStatus === "failed") {
            task.retryCount = (task.retryCount ?? 0) + 1;
          }
          state.activeTaskId = task.id;

          return {
            content: [{ type: "text" as const, text: `Started ${task.id} and made it active` }],
            details: {
              ok: true,
              task,
              activeTaskId: state.activeTaskId,
              previousStatus,
              nextStatus: task.status,
              retryCount: task.retryCount ?? 0,
            },
          };
        }

        if (action === "note") {
          if (!params.note) {
            return {
              content: [{ type: "text" as const, text: "note requires `note`." }],
              details: { ok: false },
            };
          }

          task.notes.push(params.note);
          task.timestamps.updatedAt = nowIso();

          return {
            content: [{ type: "text" as const, text: `Added note to ${task.id}` }],
            details: { ok: true, task },
          };
        }

        if (action === "evidence") {
          if (!params.evidence || params.evidence.length === 0) {
            return {
              content: [{ type: "text" as const, text: "evidence requires non-empty `evidence`." }],
              details: { ok: false },
            };
          }

          task.evidence.push(...params.evidence);
          task.timestamps.updatedAt = nowIso();

          return {
            content: [{ type: "text" as const, text: `Added evidence to ${task.id}` }],
            details: { ok: true, task },
          };
        }

        if (action === "review") {
          if (!canTransition(task.status, "review")) {
            return {
              content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> review` }],
              details: { ok: false },
            };
          }

          const previousStatus = task.status;
          task.status = "review";
          task.timestamps.updatedAt = nowIso();
          if (state.activeTaskId === task.id) state.activeTaskId = null;

          return {
            content: [{ type: "text" as const, text: `Moved ${task.id} to review` }],
            details: { ok: true, task, previousStatus, nextStatus: task.status, activeTaskId: state.activeTaskId },
          };
        }

        if (action === "requeue") {
          if (!params.note) {
            return {
              content: [{ type: "text" as const, text: "requeue requires `note`." }],
              details: { ok: false },
            };
          }

          if (!canTransition(task.status, "queued")) {
            return {
              content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> queued` }],
              details: { ok: false },
            };
          }

          const previousStatus = task.status;
          task.status = "queued";
          task.notes.push(params.note);
          task.timestamps.updatedAt = nowIso();
          if (state.activeTaskId === task.id) state.activeTaskId = null;

          return {
            content: [{ type: "text" as const, text: `Requeued ${task.id}` }],
            details: { ok: true, task, previousStatus, nextStatus: task.status, activeTaskId: state.activeTaskId },
          };
        }

        if (action === "block") {
          if (!params.note) {
            return {
              content: [{ type: "text" as const, text: "block requires `note`." }],
              details: { ok: false },
            };
          }

          if (!canTransition(task.status, "blocked")) {
            return {
              content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> blocked` }],
              details: { ok: false },
            };
          }

          const previousStatus = task.status;
          task.status = "blocked";
          task.notes.push(params.note);
          task.timestamps.updatedAt = nowIso();
          if (state.activeTaskId === task.id) state.activeTaskId = null;

          return {
            content: [{ type: "text" as const, text: `Blocked ${task.id}` }],
            details: { ok: true, task, previousStatus, nextStatus: task.status, activeTaskId: state.activeTaskId },
          };
        }

        if (action === "done") {
          if (task.status !== "review") {
            return {
              content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> done` }],
              details: { ok: false },
            };
          }

          if (task.evidence.length === 0) {
            return {
              content: [
                { type: "text" as const, text: "Task cannot be completed without evidence." },
              ],
              details: { ok: false },
            };
          }

          const unresolvedDependencies = unresolvedDependenciesForDone(state, task);
          if (unresolvedDependencies.length > 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Task cannot be completed while dependencies remain unresolved: ${unresolvedDependencies.join(", ")}`,
                },
              ],
              details: { ok: false, unresolvedDependencies },
            };
          }

          const previousStatus = task.status;
          task.status = "done";
          task.timestamps.completedAt = nowIso();
          task.timestamps.updatedAt = nowIso();
          if (state.activeTaskId === task.id) state.activeTaskId = null;

          return {
            content: [{ type: "text" as const, text: `Completed ${task.id}` }],
            details: { ok: true, task, previousStatus, nextStatus: task.status, activeTaskId: state.activeTaskId },
          };
        }

        if (action === "fail") {
          if (!params.note) {
            return {
              content: [{ type: "text" as const, text: "fail requires `note`." }],
              details: { ok: false },
            };
          }

          if (!canTransition(task.status, "failed")) {
            return {
              content: [{ type: "text" as const, text: `Illegal transition: ${task.status} -> failed` }],
              details: { ok: false },
            };
          }

          const previousStatus = task.status;
          task.status = "failed";
          task.notes.push(params.note);
          task.timestamps.updatedAt = nowIso();
          if (state.activeTaskId === task.id) state.activeTaskId = null;

          return {
            content: [{ type: "text" as const, text: `Failed ${task.id}` }],
            details: { ok: true, task, previousStatus, nextStatus: task.status, activeTaskId: state.activeTaskId },
          };
        }

        return {
          content: [{ type: "text" as const, text: `Unhandled action: ${action}` }],
          details: { ok: false },
        };
      });

      const branch = await getCurrentBranch(pi, ctx.cwd);
      const modelId = modelIdFromContext(ctx);
      const details = (result as { details?: Record<string, unknown> }).details ?? {};
      const task = details.task as TaskRecord | undefined;

      await appendAudit(ctx.cwd, {
        ts: nowIso(),
        extension: "till-done",
        action: "task_update",
        toolAction: params.action,
        cwd: ctx.cwd,
        branch,
        modelId,
        provider: providerFromModelId(modelId),
        taskId: task?.id ?? params.id ?? null,
        taskStatus: task?.status ?? null,
        activeTaskId: (details.activeTaskId as string | null | undefined) ?? null,
        owner: task?.owner ?? params.owner ?? null,
        retryCount: task?.retryCount ?? null,
        details: params,
      });

      return result;
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    const state = await readState(ctx.cwd);
    const activeTask = getActiveTask(state);

    const mutationBlockedReason = !taskIsRunnable(activeTask)
      ? "Mutating actions require an active task in `in_progress` status with an owner and acceptance criteria."
      : null;

    if (event.toolName === "write" || event.toolName === "edit") {
      if (mutationBlockedReason) {
        const branch = await getCurrentBranch(pi, ctx.cwd);
        const modelId = modelIdFromContext(ctx);
        await appendAudit(ctx.cwd, {
          ts: nowIso(),
          extension: "till-done",
          action: "blocked-mutation",
          tool: event.toolName,
          cwd: ctx.cwd,
          branch,
          modelId,
          provider: providerFromModelId(modelId),
          activeTaskId: state.activeTaskId,
          reason: mutationBlockedReason,
        });

        return { block: true, reason: mutationBlockedReason };
      }

      return;
    }

    if (event.toolName === "bash") {
      const command = String((event.input as { command?: string }).command ?? "");
      if (isMutatingBash(command) && mutationBlockedReason) {
        const branch = await getCurrentBranch(pi, ctx.cwd);
        const modelId = modelIdFromContext(ctx);
        await appendAudit(ctx.cwd, {
          ts: nowIso(),
          extension: "till-done",
          action: "blocked-mutation",
          tool: "bash",
          command,
          cwd: ctx.cwd,
          branch,
          modelId,
          provider: providerFromModelId(modelId),
          activeTaskId: state.activeTaskId,
          reason: mutationBlockedReason,
        });

        return { block: true, reason: mutationBlockedReason };
      }
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    const state = await readState(ctx.cwd);
    const activeTask = getActiveTask(state);
    if (!activeTask) return;

    if (ctx.hasUI) {
      ctx.ui.notify(`Active task still open: ${activeTask.id} (${activeTask.status})`, "info");
    }

    const branch = await getCurrentBranch(pi, ctx.cwd);
    const modelId = modelIdFromContext(ctx);
    await appendAudit(ctx.cwd, {
      ts: nowIso(),
      extension: "till-done",
      action: "agent-end-active-task",
      cwd: ctx.cwd,
      branch,
      modelId,
      provider: providerFromModelId(modelId),
      activeTaskId: activeTask.id,
      status: activeTask.status,
      owner: activeTask.owner,
      retryCount: activeTask.retryCount ?? 0,
    });
  });
}
