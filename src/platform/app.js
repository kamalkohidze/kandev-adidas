import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { registerCustomerRoutes } from "../modules/customer/api/routes.js";
import { registerI18nRoutes } from "../modules/i18n/routes.js";
import { resolveRequestLocale } from "../modules/i18n/index.js";
import { createJsonResponse, createNotFoundResponse, parseJsonBody } from "./http.js";
import { moduleRegistry } from "./module-registry.js";
import { createSeedData } from "./seed-data.js";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const publicDir = join(rootDir, "public");

const staticTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

export function createApp() {
  const routes = [];
  const appData = createSeedData();

  function route(method, path, handler) {
    routes.push({ method, path, handler });
  }

  route("GET", "/api/v1/health", async () =>
    createJsonResponse(200, {
      status: "ok",
      service: "uco-crm-retail-platform",
      contracts: ["Customer", "CustomerIdentity", "Customer360Profile"],
      generated_at: new Date().toISOString()
    })
  );

  route("GET", "/api/v1/modules", async () =>
    createJsonResponse(200, {
      data: moduleRegistry
    })
  );

  registerCustomerRoutes(route, appData);
  registerI18nRoutes(route);

  async function handle(method, rawUrl, options = {}) {
    const url = new URL(rawUrl, "http://localhost");
    const routeMatch = routes.find((candidate) => candidate.method === method && candidate.path === url.pathname);

    if (routeMatch) {
      return routeMatch.handler({
        headers: options.headers || {},
        query: url.searchParams,
        body: options.body ?? null
      });
    }

    if (method === "GET") {
      const staticResponse = await tryStaticFile(url.pathname);
      if (staticResponse) {
        return staticResponse;
      }
    }

    return createNotFoundResponse(resolveRequestLocale(options.headers || {}));
  }

  async function handleNodeRequest(request) {
    const body = await parseJsonBody(request);
    return handle(request.method || "GET", request.url || "/", {
      headers: request.headers,
      body
    });
  }

  return {
    handle,
    handleNodeRequest
  };
}

async function tryStaticFile(pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = join(publicDir, safePath);

  if (!absolutePath.startsWith(publicDir)) {
    return null;
  }

  try {
    const body = await readFile(absolutePath);
    return {
      status: 200,
      headers: {
        "content-type": staticTypes.get(extname(absolutePath)) || "application/octet-stream"
      },
      body
    };
  } catch {
    return null;
  }
}
