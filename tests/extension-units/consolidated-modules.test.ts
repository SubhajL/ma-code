import assert from "node:assert/strict";
import test from "node:test";

import packetsExtension, {
  generateBackendImplementationPacket,
  generateFrontendImplementationPacket,
  generateTaskPacket,
} from "../../.pi/agent/extensions/packets.ts";
import recoveryExtension, {
  resolveRecoveryPolicy,
  resolveRecoveryRuntimeDecision,
} from "../../.pi/agent/extensions/recovery.ts";
import stitchExtension, {
  generateMockStitchArtifact,
  generateStitchPrompt,
  planLiveStitchArtifact,
} from "../../.pi/agent/extensions/stitch.ts";
import { FakePi } from "./test-utils.ts";

test("consolidated recovery module registers policy and runtime tools", () => {
  const pi = new FakePi("task/consolidated-recovery");

  recoveryExtension(pi as any);

  assert.equal(typeof resolveRecoveryPolicy, "function");
  assert.equal(typeof resolveRecoveryRuntimeDecision, "function");
  assert.equal(pi.getTool("resolve_recovery_policy").name, "resolve_recovery_policy");
  assert.equal(pi.getTool("resolve_recovery_runtime_decision").name, "resolve_recovery_runtime_decision");
});

test("consolidated packets module registers task packet tool and exports packet helpers", () => {
  const pi = new FakePi("task/consolidated-packets");

  packetsExtension(pi as any);

  assert.equal(typeof generateTaskPacket, "function");
  assert.equal(typeof generateFrontendImplementationPacket, "function");
  assert.equal(typeof generateBackendImplementationPacket, "function");
  assert.equal(pi.getTool("generate_task_packet").name, "generate_task_packet");
});

test("consolidated stitch module exports prompt, mock, and live helpers", () => {
  stitchExtension();

  assert.equal(typeof generateStitchPrompt, "function");
  assert.equal(typeof generateMockStitchArtifact, "function");
  assert.equal(typeof planLiveStitchArtifact, "function");
});
