/**
 * Shared helpers for the validator-report CLI emitters.
 *
 * Used by:
 * - `scripts/lib/emit-validator-report.ts` (generic ADR-0007 contract)
 * - `scripts/lib/emit-product-pipeline-e2e-report.ts` (rich-schema sibling, ADR-0008)
 *
 * Extracted because the two emitter modules independently re-implemented
 * the same `takeValue` argv helper, `isRecord` type guard,
 * canonical-JSON formatting, and CLI `isMain`/`process.exit`
 * bootstrapping. ADR-0008's "premature with only 2 instances" deferral
 * was lifted to consolidate before any third rich-schema emitter
 * arrives.
 */

import { fileURLToPath } from "node:url";

/**
 * Reads the next argv entry after position `i`, treating it as a
 * non-empty path argument. Throws when the next token is missing,
 * empty, or looks like another flag (`-` prefix).
 */
export function takeValue(argv: readonly string[], i: number, flag: string): string {
  const next = argv[i + 1];
  if (typeof next !== "string" || next.length === 0 || next.startsWith("-")) {
    throw new Error(`${flag} requires a non-empty path argument`);
  }
  return next;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Renders a value as JSON in the canonical byte shape every emitter
 * uses: two-space indent + trailing newline. Matches the Python
 * `json.dump(obj, f, indent=2); f.write("\n")` output byte-for-byte.
 */
export function canonicalJson<T>(value: T): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Detects whether the current module was invoked directly as a CLI
 * (as opposed to imported as a library). The standard ESM idiom is
 * to compare `import.meta.url` against the entry-point URL.
 *
 * Pass `moduleUrl` as `import.meta.url` from the calling module.
 *
 * Note: `process.argv[1]` is the entry-point file path as the OS sees
 * it (no `file://` scheme), so we convert the imported `moduleUrl` to
 * a path via `fileURLToPath` and compare paths. This is more robust
 * than string-concatenating `file://` onto `process.argv[1]` because
 * it normalises symlinks and Windows drive letters consistently.
 */
export function isCliMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(moduleUrl) === entry;
  } catch {
    return false;
  }
}

/**
 * Wraps a `runEmitter(argv): Promise<number>` function with the
 * standard CLI bootstrap: only fire when the module is the entry
 * point, slice `process.argv`, propagate the exit code, and turn any
 * unexpected throw into a typed stderr line + exit 1.
 *
 * Each emitter calls this once at the bottom of its module so the
 * `isMain` guard + argv slicing + error funnel are not re-implemented
 * per file.
 */
export function runCliMain(
  moduleUrl: string,
  emitterName: string,
  runEmitter: (argv: readonly string[]) => Promise<number>,
): void {
  if (!isCliMain(moduleUrl)) return;
  runEmitter(process.argv.slice(2)).then(
    (code) => {
      process.exit(code);
    },
    (error) => {
      process.stderr.write(`${emitterName}: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
