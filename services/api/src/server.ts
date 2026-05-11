import { healthCheck, type HealthResponse } from "./health.ts";

export interface ServerEntry {
  healthPath: "/health";
  handleHealth: () => HealthResponse;
}

export function createServerEntry(): ServerEntry {
  return {
    healthPath: "/health",
    handleHealth: () => healthCheck(),
  };
}
