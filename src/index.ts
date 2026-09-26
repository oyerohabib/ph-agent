#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createPostHogMcpServer } from "./server.js";
import { createPostHogClient } from "./posthog/client.js";
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../.env") });
loadEnv({ path: resolve(here, "../../.env") });
loadEnv();
async function main() {
  const client = createPostHogClient();
  console.error(
    `[posthog-mcp] starting in ${client.mode} mode (set POSTHOG_MODE=live + POSTHOG_API_KEY for real API, or use .env)`,
  );
  const server = createPostHogMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((err) => {
  console.error("[posthog-mcp] fatal:", err);
  process.exit(1);
});
