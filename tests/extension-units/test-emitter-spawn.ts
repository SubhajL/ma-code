import { spawn } from "node:child_process";

/**
 * Shared helper for tests that invoke a `scripts/lib/emit-*-report.ts`
 * CLI emitter as a child process via `node --import tsx <path> ...`.
 *
 * Used by `validator-report.test.ts` and `product-pipeline-e2e-report.test.ts`
 * (and any future emitter test files). Captures stdout + stderr + exit
 * code. If `stdin` is provided, writes it to the child's stdin and
 * closes; otherwise stdin is closed immediately.
 */
export function spawnEmitterChild(
  emitterPath: string,
  args: readonly string[],
  stdin?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--import", "tsx", emitterPath, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}
