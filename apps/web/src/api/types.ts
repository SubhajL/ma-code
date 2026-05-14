import type { GreenfieldOpenApiContract } from "../../../../services/api/src/contracts/openapi.ts";

export type GreenfieldApiContract = GreenfieldOpenApiContract;
export type GreenfieldApiEndpoint = keyof GreenfieldApiContract["paths"];
export type ScaffoldQueueReadiness = GreenfieldApiContract["x-greenfield-scaffold"]["queueReadiness"];
export type ScaffoldWorkerImplementationDependency =
  GreenfieldApiContract["x-greenfield-scaffold"]["workerImplementationDependencies"][number];
export type AuthSessionPlaceholder = GreenfieldApiContract["components"]["schemas"]["AuthSessionPlaceholder"]["example"];
export type ScaffoldErrorEnvelope = GreenfieldApiContract["components"]["schemas"]["ErrorEnvelope"]["example"];

export const greenfieldApiEndpoints = {
  health: "/health",
  authSession: "/auth/session",
  users: "/users",
  projects: "/projects",
} as const satisfies Record<string, GreenfieldApiEndpoint>;

export const authSessionPlaceholderExample = {
  authenticated: false,
  actor: null,
} as const satisfies AuthSessionPlaceholder;

export const scaffoldErrorExample = {
  error: "not_implemented",
  message: "Phase A documents this scaffold resource without enabling queue-ready execution.",
} as const satisfies ScaffoldErrorEnvelope;

export const scaffoldQueueReadiness = "not_ready" as const satisfies ScaffoldQueueReadiness;

export const scaffoldWorkerImplementationDependencies = [
  {
    issueId: "issue-008",
    reason:
      "The auth placeholder remains a separate worker task; this Phase A artifact only documents the unauthenticated contract boundary.",
  },
  {
    issueId: "issue-012",
    reason:
      "The frontend API client scaffold should consume this contract artifact instead of re-declaring endpoint and schema shapes.",
  },
] as const satisfies readonly ScaffoldWorkerImplementationDependency[];

export type ScaffoldResourceEndpoint =
  | typeof greenfieldApiEndpoints.users
  | typeof greenfieldApiEndpoints.projects;
