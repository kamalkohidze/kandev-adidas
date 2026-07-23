import { createServer } from "node:http";
import { createApp } from "./platform/app.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const app = createApp();

const server = createServer(async (request, response) => {
  const result = await app.handleNodeRequest(request);
  response.writeHead(result.status, result.headers);
  response.end(result.body);
});

server.listen(port, host, () => {
  console.log(`UCO CRM scaffold listening on http://${host}:${port}`);
});
