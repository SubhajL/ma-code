import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import { createGreenfieldApiClient, ScaffoldApiError } from "../../../apps/web/src/api/client.ts";
import { fetchBackendHealth } from "../../../apps/web/src/lib/health-client.ts";
import { bootstrapAppShell } from "../../../apps/web/src/main.tsx";
import { greenfieldOpenApiContract } from "../../../services/api/src/contracts/openapi.ts";
import { readGreenfieldSeedProjects, readGreenfieldSeedUsers } from "../../../services/api/src/db/seeds.ts";
import { createHealthRoute } from "../../../services/api/src/routes/health.ts";

const greenfieldSmokeIssueSummaryUrl = new URL(
  "../../../docs/initiatives/greenfield-scaffold/slices/issue-014.summary.json",
  import.meta.url,
);

export interface GreenfieldSmokeRequest {
  method: string | undefined;
  url: string | undefined;
}

export interface GreenfieldSmokeIssueSummary {
  issueId: string;
  queueReadiness: string;
  acceptanceCriteria: string[];
}

export interface GreenfieldSmokePage {
  status: number;
  html: string;
  requests: readonly GreenfieldSmokeRequest[];
  issueSummary: GreenfieldSmokeIssueSummary;
}

export async function loadGreenfieldSmokePage(): Promise<GreenfieldSmokePage> {
  const requests: GreenfieldSmokeRequest[] = [];
  const healthRoute = createHealthRoute();
  const issueSummary = await readGreenfieldSmokeIssueSummary();
  let baseUrl = "";

  const server = createServer(async (request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
    });

    if (request.method === "GET" && request.url === "/") {
      const page = await renderGreenfieldSmokePage({
        baseUrl,
        issueSummary,
      });

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(page);
      return;
    }

    if (request.method === healthRoute.method && request.url === healthRoute.path) {
      const routeResponse = healthRoute.handle();
      response.writeHead(routeResponse.status, routeResponse.headers);
      response.end(JSON.stringify(routeResponse.body));
      return;
    }

    if (request.method === "GET" && request.url === "/auth/session") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(greenfieldOpenApiContract.components.schemas.AuthSessionPlaceholder.example));
      return;
    }

    if (request.method === "GET" && (request.url === "/users" || request.url === "/projects")) {
      response.writeHead(501, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(greenfieldOpenApiContract.components.schemas.ErrorEnvelope.example));
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected the greenfield smoke server to expose a TCP address.");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/`, {
      headers: {
        accept: "text/html",
      },
    });

    return {
      status: response.status,
      html: await response.text(),
      requests,
      issueSummary,
    };
  } finally {
    server.close();
  }
}

async function renderGreenfieldSmokePage(options: {
  baseUrl: string;
  issueSummary: GreenfieldSmokeIssueSummary;
}): Promise<string> {
  const target = { innerHTML: "" };
  bootstrapAppShell(target);

  const health = await fetchBackendHealth({ baseUrl: options.baseUrl });
  const client = createGreenfieldApiClient({ baseUrl: options.baseUrl });
  const authSession = await client.getAuthSession();
  const usersPlaceholder = await captureScaffoldPlaceholder(() => client.getUsers());
  const projectsPlaceholder = await captureScaffoldPlaceholder(() => client.getProjects());
  const users = readGreenfieldSeedUsers();
  const projects = readGreenfieldSeedProjects();

  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "  <body>",
    `    <section data-testid=\"app-load\">${target.innerHTML}</section>`,
    `    <section data-testid=\"health-display\"><p>Backend health: ${health.service} (${health.ok ? "ok" : "down"})</p></section>`,
    "    <section data-testid=\"placeholder-flow\">",
    `      <p>Auth session: ${authSession.authenticated ? "authenticated" : "unauthenticated"} placeholder</p>`,
    `      <p>Queue readiness: ${options.issueSummary.queueReadiness}</p>`,
    `      <p>Fixture preview: ${users.length} users, ${projects.length} projects</p>`,
    `      <p>Sample user: ${users[0]?.displayName ?? "missing"}</p>`,
    `      <p>Sample project: ${projects[0]?.name ?? "missing"}</p>`,
    `      <p>${usersPlaceholder.endpoint} -> ${usersPlaceholder.code}</p>`,
    `      <p>${projectsPlaceholder.endpoint} -> ${projectsPlaceholder.code}</p>`,
    "    </section>",
    "  </body>",
    "</html>",
  ].join("\n");
}

async function captureScaffoldPlaceholder(request: () => Promise<never>): Promise<ScaffoldApiError> {
  try {
    await request();
  } catch (error) {
    if (error instanceof ScaffoldApiError) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected the scaffold smoke request to stay in the placeholder path.");
}

async function readGreenfieldSmokeIssueSummary(): Promise<GreenfieldSmokeIssueSummary> {
  return JSON.parse(await readFile(greenfieldSmokeIssueSummaryUrl, "utf8")) as GreenfieldSmokeIssueSummary;
}
