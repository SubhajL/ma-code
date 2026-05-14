import { healthCheck, type HealthPayload } from "../health.ts";

export interface HealthRouteResponse {
  status: 200;
  headers: {
    "content-type": "application/json; charset=utf-8";
  };
  body: HealthPayload;
}

export interface HealthRoute {
  method: "GET";
  path: "/health";
  handle: () => HealthRouteResponse;
}

export function createHealthRoute(): HealthRoute {
  return {
    method: "GET",
    path: "/health",
    handle: () => ({
      ...healthCheck(),
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    }),
  };
}
