export interface BackendHealthPayload {
  ok: true;
  service: "greenfield-api";
}

export interface BackendHealthStatus extends BackendHealthPayload {
  endpoint: "/health";
}

export interface FetchBackendHealthOptions {
  baseUrl: string | URL;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

const HEALTH_ENDPOINT = "/health";

function resolveFetch(fetchImplementation?: typeof globalThis.fetch): typeof globalThis.fetch {
  const resolved = fetchImplementation ?? globalThis.fetch;

  if (typeof resolved !== "function") {
    throw new Error("Backend health client requires a fetch implementation.");
  }

  return resolved;
}

function isBackendHealthPayload(value: unknown): value is BackendHealthPayload {
  return typeof value === "object"
    && value !== null
    && "ok" in value
    && value.ok === true
    && "service" in value
    && value.service === "greenfield-api";
}

export async function fetchBackendHealth(options: FetchBackendHealthOptions): Promise<BackendHealthStatus> {
  const response = await resolveFetch(options.fetch)(new URL(HEALTH_ENDPOINT, options.baseUrl), {
    method: "GET",
    headers: {
      accept: "application/json",
    },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Backend health request failed with status ${response.status}.`);
  }

  const payload = await response.json();

  if (!isBackendHealthPayload(payload)) {
    throw new Error("Backend health response was invalid.");
  }

  return {
    ...payload,
    endpoint: HEALTH_ENDPOINT,
  };
}
