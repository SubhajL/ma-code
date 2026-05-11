import type { QueueJobWorkerExecutionPlan } from "./queue-runner.ts";

export interface WorkerExecutionPlanInvocation {
  program: string;
  args: string[];
  displayCommand: string;
}

function buildBridgeDriverPrompt(plan: QueueJobWorkerExecutionPlan): string {
  const fields = [
    `prompt ${JSON.stringify(plan.prompt)}`,
    `toolProfile ${plan.toolProfile ?? "coding"}`,
    `includeProjectExtensions ${plan.includeProjectExtensions === true ? "true" : "false"}`,
    `includeContextFiles ${plan.includeContextFiles === false ? "false" : "true"}`,
  ];
  if (plan.provider) fields.push(`provider ${plan.provider}`);
  if (plan.modelId) fields.push(`modelId ${plan.modelId}`);
  if (plan.thinkingLevel) fields.push(`thinkingLevel ${plan.thinkingLevel}`);
  return [
    `Use run_same_runtime_probe with ${fields.join(", ")}.`,
    "If the tool reports ok false or a non-empty assistantError, return exactly __PI_ERROR__ followed by the shortest reason.",
    "Otherwise return exactly __PI_OK__ on the first line and the responseText on subsequent lines with no extra commentary.",
  ].join(" ");
}

export function describeWorkerExecutionPlan(plan: QueueJobWorkerExecutionPlan): string {
  const model = plan.provider && plan.modelId
    ? `${plan.provider}/${plan.modelId}`
    : plan.modelId ?? plan.provider ?? "default";
  return `${plan.strategy}(toolProfile=${plan.toolProfile ?? "coding"}, model=${model}, thinking=${plan.thinkingLevel ?? "default"})`;
}

export function buildWorkerExecutionPlanInvocation(plan: QueueJobWorkerExecutionPlan): WorkerExecutionPlanInvocation {
  if (plan.strategy !== "same_runtime_prompt") throw new Error(`Unsupported worker execution plan strategy: ${plan.strategy}`);
  const args = [
    "--print",
    "--no-session",
    "--no-extensions",
    "-e",
    "./.pi/agent/extensions/same-runtime-bridge.ts",
  ];
  if (plan.provider && plan.modelId) args.push("--model", `${plan.provider}/${plan.modelId}`);
  if (plan.thinkingLevel) args.push("--thinking", plan.thinkingLevel);
  const bridgePrompt = buildBridgeDriverPrompt(plan);
  const script = [
    'const { execFileSync } = require("node:child_process");',
    `const args = ${JSON.stringify(args)};`,
    `const prompt = ${JSON.stringify(bridgePrompt)};`,
    'try {',
    '  const output = execFileSync("pi", [...args, prompt], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });',
    '  process.stdout.write(output);',
    '  if (!output.includes("__PI_OK__")) {',
    '    process.stderr.write(output);',
    '    process.exit(1);',
    '  }',
    '} catch (error) {',
    '  if (error.stdout) process.stdout.write(String(error.stdout));',
    '  if (error.stderr) process.stderr.write(String(error.stderr));',
    '  else if (error.message) process.stderr.write(String(error.message));',
    '  process.exit(typeof error.status === "number" ? error.status : 1);',
    '}',
  ].join(" ");
  return {
    program: "node",
    args: ["-e", script],
    displayCommand: `node -e ${JSON.stringify(script)}`,
  };
}

export function buildWorkerExecutionPlanCommand(plan: QueueJobWorkerExecutionPlan): string {
  return buildWorkerExecutionPlanInvocation(plan).displayCommand;
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function workerSameRuntimeExecution(): void {}
