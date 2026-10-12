import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import taskPacketsExtension from "./task-packets.ts";

export * from "./task-packets.ts";
export * from "./frontend-packet-generator.ts";
export * from "./backend-packet-generator.ts";
export { default as taskPacketsExtension } from "./task-packets.ts";
export { default as frontendPacketGeneratorExtension } from "./frontend-packet-generator.ts";
export { default as backendPacketGeneratorExtension } from "./backend-packet-generator.ts";
export { generateTaskPacket, loadPacketPolicy, validateTaskPacketShape } from "./task-packets.ts";
export { generateFrontendImplementationPacket, writeFrontendPacketPreview } from "./frontend-packet-generator.ts";
export { generateBackendImplementationPacket, writeBackendPacketPreview } from "./backend-packet-generator.ts";

/**
 * Composite module for imports and re-exports. pi loads `task-packets.ts` from
 * `.pi/settings.json` and must not load this file as well, so that
 * `generate_task_packet` is registered once.
 */
export default function packetsExtension(pi: ExtensionAPI): void {
  taskPacketsExtension(pi);
}
