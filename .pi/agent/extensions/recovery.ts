import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import recoveryPolicyExtension from "./recovery-policy.ts";
import recoveryRuntimeExtension from "./recovery-runtime.ts";

export * from "./recovery-policy.ts";
export * from "./recovery-runtime.ts";
export { default as recoveryPolicyExtension } from "./recovery-policy.ts";
export { default as recoveryRuntimeExtension } from "./recovery-runtime.ts";
export { loadRecoveryPolicy, parseRecoveryPolicy, resolveRecoveryPolicy } from "./recovery-policy.ts";
export { findRecoveryRuntimeTask, loadRecoveryRuntimeTaskState, resolveRecoveryRuntimeDecision } from "./recovery-runtime.ts";

export default function recoveryExtension(pi: ExtensionAPI): void {
  recoveryPolicyExtension(pi);
  recoveryRuntimeExtension(pi);
}
