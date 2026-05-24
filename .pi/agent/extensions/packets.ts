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

export default function packetsExtension(pi: ExtensionAPI): void {
  taskPacketsExtension(pi);
}
