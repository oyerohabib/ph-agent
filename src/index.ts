#!/usr/bin/env node
/**
 * PostHog MCP server entry — stdio transport for local agent hosts.
 * Logs go to stderr only; stdout is reserved for JSON-RPC.
 */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createPostHogMcpServer } from "./server.js";
import { createPostHogClient } from "./posthog/client.js";

async function main() {
  const client = createPostHogClient();
  console.error(
    `[posthog-mcp] starting in ${client.mode} mode (set POSTHOG_MODE=live + POSTHOG_API_KEY for real API)`,
  );
  const server = createPostHogMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[posthog-mcp] fatal:", err);
  process.exit(1);
});
