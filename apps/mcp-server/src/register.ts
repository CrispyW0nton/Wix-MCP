import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isWixMcpError } from "@wix-mcp/core";
import type { HybridRouter } from "@wix-mcp/executors";
import type { ToolDefinition } from "@wix-mcp/tool-definitions";
import type { ZodObject, ZodRawShape } from "zod";

/**
 * Registers every tool with the MCP server, wired through the HybridRouter.
 *
 * The MCP SDK's `tool()` accepts a zod *raw shape*, so we extract `.shape`
 * from the top-level object schema. All tool inputs in this codebase are
 * z.object(...) at the top level by convention; if you add a tool with a
 * union or record top-level schema, wrap it in z.object({...}) first.
 */
export function registerTools(server: McpServer, router: HybridRouter, tools: ToolDefinition[]) {
  for (const tool of tools) {
    const schema = tool.inputSchema as unknown as ZodObject<ZodRawShape>;
    if (!schema || typeof (schema as { shape?: unknown }).shape !== "object") {
      throw new Error(
        `Tool '${tool.metadata.name}' must use a top-level z.object(...) input schema for MCP registration.`,
      );
    }

    server.tool(
      tool.metadata.name,
      tool.metadata.description,
      schema.shape,
      async (args: unknown) => {
        try {
          const result = await router.execute(tool, args);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          const code = isWixMcpError(err) ? err.code : "INTERNAL_ERROR";
          const message = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    ok: false,
                    errorCode: code,
                    errorMessage: message,
                    tool: tool.metadata.name,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      },
    );
  }
}
