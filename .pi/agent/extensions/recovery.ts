import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import recoveryPolicyExtension from "./recovery-policy.ts";
import recoveryRuntimeExtension from "./recovery-runtime.ts";

export * from "./recovery-policy.ts";
export * from "./recovery-runtime.ts";
export { default as recoveryPolicyExtension } from "./recovery-policy.ts";
export { default as recoveryRuntimeExtension } from "./recovery-runtime.ts";
export { loadRecoveryPolicy, parseRecoveryPolicy, resolveRecoveryPolicy } from "./recovery-policy.ts";
export { findRecoveryRuntimeTask, loadRecoveryRuntimeTaskState, resolveRecoveryRuntimeDecision } from "./recovery-runtime.ts";

/**
 * Composite module for imports and re-exports. pi loads the split modules from
 * `.pi/settings.json` and must not load this file as well: pi gives each file its
 * own module instance and ExtensionAPI, so the split factories' idempotency guard
 * (which covers composing them on one API) cannot see a registration made here.
 */
export default function recoveryExtension(pi: ExtensionAPI): void {
  recoveryPolicyExtension(pi);
  recoveryRuntimeExtension(pi);
}
