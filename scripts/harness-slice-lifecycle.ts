#!/usr/bin/env node
import { assessSliceLifecycle, SLICE_LIFECYCLE_STAGES, type SliceLifecycleStage } from "../.pi/agent/extensions/slice-lifecycle.ts";

function usage(): string {
  return `Usage: harness-slice-lifecycle <status|check> [options]\n\nOptions:\n  --stage <stage>   Target stage for check mode\n  --json            Emit JSON\n  -h, --help        Show help\n\nStages:\n  ${SLICE_LIFECYCLE_STAGES.join("\n  ")}\n`;
}

function parseArgs(argv: string[]) {
  const [command = "status", ...rest] = argv;
  let stage: SliceLifecycleStage | undefined;
  let json = false;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--stage") {
      const value = rest[i + 1];
      if (!value || !SLICE_LIFECYCLE_STAGES.includes(value as SliceLifecycleStage)) {
        throw new Error(`Invalid --stage value: ${value ?? "<missing>"}`);
      }
      stage = value as SliceLifecycleStage;
      i += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") return { command: "help", stage, json };
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { command, stage, json };
}

function printText(result: { ok: boolean; assessment: Awaited<ReturnType<typeof assessSliceLifecycle>> }) {
  const { assessment } = result;
  console.log(`Slice lifecycle: ${assessment.currentStage}`);
  if (assessment.target) console.log(`Target ${assessment.target.stage}: ${assessment.target.ready ? "ready" : "blocked"}`);
  if (assessment.blockingGaps.length > 0) {
    console.log("Blocking gaps:");
    for (const gap of assessment.blockingGaps) console.log(`- ${gap}`);
  } else {
    console.log("Blocking gaps: none");
  }
  console.log("Next allowed actions:");
  for (const action of assessment.nextAllowedActions) console.log(`- ${action}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    console.log(usage());
    return;
  }
  if (args.command !== "status" && args.command !== "check") throw new Error(`Unknown command: ${args.command}`);
  if (args.command === "check" && !args.stage) throw new Error("check mode requires --stage <stage>");

  const assessment = await assessSliceLifecycle({ cwd: process.cwd(), targetStage: args.command === "check" ? args.stage : undefined });
  const ok = args.command === "check" ? assessment.target?.ready === true : true;
  const payload = { ok, assessment };

  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else printText(payload);

  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
