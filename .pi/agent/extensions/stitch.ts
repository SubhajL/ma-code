export * from "./stitch-prompt-generator.ts";
export * from "./stitch-artifact-adapter.ts";
export * from "./live-stitch-adapter.ts";
export { default as stitchPromptGeneratorExtension } from "./stitch-prompt-generator.ts";
export { default as stitchArtifactAdapterExtension } from "./stitch-artifact-adapter.ts";
export { default as liveStitchAdapterExtension } from "./live-stitch-adapter.ts";
export { generateStitchPrompt, writeStitchPromptArtifacts } from "./stitch-prompt-generator.ts";
export { generateMockStitchArtifact, writeMockStitchArtifactArtifacts } from "./stitch-artifact-adapter.ts";
export { applyLiveStitchArtifact, planLiveStitchArtifact, writeLiveStitchArtifactArtifacts } from "./live-stitch-adapter.ts";

export default function stitchExtension(): void {}
