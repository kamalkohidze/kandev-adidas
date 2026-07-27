import { createServer } from "node:http";
import { createApp } from "./platform/app.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
// The scaffold is a single-tenant process. Production auth middleware can provide
// a per-request resolver when constructing the app instead.
const configuredTenantId =
  process.env.UCO_TENANT_ID || "00000000-0000-4000-8000-000000000001";
const app = createApp({ resolveTenant: () => configuredTenantId });

const server = createServer(async (request, response) => {
  const result = await app.handleNodeRequest(request);
  response.writeHead(result.status, result.headers);
  response.end(result.body);
});

server.listen(port, host, () => {
  console.log(`UCO CRM scaffold listening on http://${host}:${port}`);
});
