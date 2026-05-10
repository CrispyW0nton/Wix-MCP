#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLogger } from "@wix-mcp/core";
import { buildComposition } from "./composition.js";
import { registerTools } from "./register.js";
import { ALL_TOOLS } from "./tools/index.js";

async function main() {
  // MCP servers communicate over stdout via stdio transport, so the logger
  // MUST write to stderr only. createLogger defaults to fd=2.
  const logger = createLogger({ service: "wix-mcp-server" });

  const composition = buildComposition();

  const server = new McpServer({
    name: "wix-mcp-server",
    version: "0.1.0",
  });

  registerTools(server, composition.router, ALL_TOOLS);
  logger.info(
    { toolCount: ALL_TOOLS.length, flags: composition.flags },
    "Registered Wix MCP tools.",
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("wix-mcp-server connected over stdio.");

  const cleanup = async () => {
    await composition.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal:", err);
  process.exit(1);
});
