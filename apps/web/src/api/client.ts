import {
  authSessionPlaceholderExample,
  greenfieldApiEndpoints,
  scaffoldErrorExample,
  scaffoldQueueReadiness,
  scaffoldWorkerImplementationDependencies,
  type AuthSessionPlaceholder,
  type ScaffoldErrorEnvelope,
  type ScaffoldResourceEndpoint,
  type ScaffoldWorkerImplementationDependency,
} from "./types.ts";

export interface CreateGreenfieldApiClientOptions {
  baseUrl: string | URL;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export interface GreenfieldApiClient {
  getAuthSession(): Promise<AuthSessionPlaceholder & { endpoint: typeof greenfieldApiEndpoints.authSession }>;
  getUsers(): Promise<never>;
  getProjects(): Promise<never>;
}

export class ScaffoldApiError extends Error {
  readonly name = "ScaffoldApiError";
  readonly code: ScaffoldErrorEnvelope["error"];
  readonly endpoint: ScaffoldResourceEndpoint;
  readonly status = 501 as const;
  readonly queueReadiness = scaffoldQueueReadiness;
  readonly workerImplementationDependencies: readonly ScaffoldWorkerImplementationDependency[] =
    scaffoldWorkerImplementationDependencies;

  constructor(endpoint: ScaffoldResourceEndpoint, error: ScaffoldErrorEnvelope) {
    super(`Scaffold resource ${endpoint} is not implemented during Phase A materialization.`);
    this.code = error.error;
    this.endpoint = endpoint;
  }
}

function resolveFetch(fetchImplementation?: typeof globalThis.fetch): typeof globalThis.fetch {
  const resolved = fetchImplementation ?? globalThis.fetch;

  if (typeof resolved !== "function") {
    throw new Error("Greenfield API client requires a fetch implementation.");
  }

  return resolved;
}

function isAuthSessionPlaceholder(value: unknown): value is AuthSessionPlaceholder {
  return typeof value === "object"
    && value !== null
    && "authenticated" in value
    && value.authenticated === authSessionPlaceholderExample.authenticated
    && "actor" in value
    && value.actor === authSessionPlaceholderExample.actor;
}

function isScaffoldErrorEnvelope(value: unknown): value is ScaffoldErrorEnvelope {
  return typeof value === "object"
    && value !== null
    && "error" in value
    && value.error === scaffoldErrorExample.error
    && "message" in value
    && typeof value.message === "string";
}

async function requestJson(endpoint: string, options: CreateGreenfieldApiClientOptions): Promise<{
  response: Response;
  payload: unknown;
}> {
  const response = await resolveFetch(options.fetch)(new URL(endpoint, options.baseUrl), {
    method: "GET",
    headers: {
      accept: "application/json",
    },
    signal: options.signal,
  });

  return {
    response,
    payload: await response.json().catch(() => undefined),
  };
}

async function requestAuthSession(
  options: CreateGreenfieldApiClientOptions,
): Promise<AuthSessionPlaceholder & { endpoint: typeof greenfieldApiEndpoints.authSession }> {
  const { response, payload } = await requestJson(greenfieldApiEndpoints.authSession, options);

  if (!response.ok) {
    throw new Error(`Auth session request failed with status ${response.status}.`);
  }

  if (!isAuthSessionPlaceholder(payload)) {
    throw new Error("Auth session response was invalid.");
  }

  return {
    ...payload,
    endpoint: greenfieldApiEndpoints.authSession,
  };
}

async function requestScaffoldResource(
  endpoint: ScaffoldResourceEndpoint,
  options: CreateGreenfieldApiClientOptions,
): Promise<never> {
  const { response, payload } = await requestJson(endpoint, options);

  if (response.status === 501 && isScaffoldErrorEnvelope(payload)) {
    throw new ScaffoldApiError(endpoint, payload);
  }

  if (response.status === 501) {
    throw new Error(`Scaffold resource ${endpoint} returned an invalid scaffold error response.`);
  }

  throw new Error(`Scaffold resource ${endpoint} request failed with status ${response.status}.`);
}

export function createGreenfieldApiClient(options: CreateGreenfieldApiClientOptions): GreenfieldApiClient {
  return {
    getAuthSession: () => requestAuthSession(options),
    getUsers: () => requestScaffoldResource(greenfieldApiEndpoints.users, options),
    getProjects: () => requestScaffoldResource(greenfieldApiEndpoints.projects, options),
  };
}
