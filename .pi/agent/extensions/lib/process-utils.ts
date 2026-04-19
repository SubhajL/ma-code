import { spawn } from "node:child_process";

export interface CommandRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  aborted: boolean;
}

export function truncateText(text: string, maxChars = 12000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`;
}

export function createLinkedAbortController(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onAbort = () => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", onAbort);
    },
    wasTimedOut() {
      return timedOut;
    },
  };
}

export async function runSpawn(
  command: string,
  args: string[],
  options: {
    cwd: string;
    input?: string;
    timeoutMs: number;
    signal?: AbortSignal;
    shell?: boolean;
  },
): Promise<CommandRunResult> {
  const linked = createLinkedAbortController(options.signal, options.timeoutMs);

  return new Promise<CommandRunResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      shell: options.shell ?? false,
      signal: linked.signal,
      stdio: "pipe",
    });

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (settled) return;
      if (linked.signal.aborted || (error as Error).name === "AbortError") {
        settled = true;
        linked.cleanup();
        resolve({
          stdout,
          stderr,
          code: null,
          timedOut: linked.wasTimedOut(),
          aborted: !!options.signal?.aborted,
        });
        return;
      }

      settled = true;
      linked.cleanup();
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      linked.cleanup();
      resolve({
        stdout,
        stderr,
        code,
        timedOut: linked.wasTimedOut(),
        aborted: !!options.signal?.aborted,
      });
    });

    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });
}
