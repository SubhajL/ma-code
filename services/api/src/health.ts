export interface HealthPayload {
  ok: true;
  service: "greenfield-api";
}

export interface HealthResponse {
  status: 200;
  body: HealthPayload;
}

export function healthCheck(): HealthResponse {
  return {
    status: 200,
    body: {
      ok: true,
      service: "greenfield-api",
    },
  };
}
