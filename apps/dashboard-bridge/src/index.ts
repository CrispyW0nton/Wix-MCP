import Fastify from "fastify";
import { loadConfig } from "@wix-mcp/config";
import { createLogger } from "@wix-mcp/core";

/**
 * Dashboard bridge stub.
 *
 * In production this app is loaded inside a Wix dashboard surface (custom
 * dashboard page or app extension) so that it can call APIs as the *Wix user*.
 * From the MCP server's perspective, it exposes a single RPC endpoint that
 * accepts:
 *
 *   POST /bridge/invoke  { op, args }
 *
 * and forwards the call as the dashboard user. The endpoint is gated by
 * `x-bridge-token` so that only the trusted MCP server can call it.
 *
 * The OPERATIONS map below is the registry the MCP server can probe.
 * Each op should be a small, audited workflow — never a generic HTTP proxy.
 */
const OPERATIONS = new Set<string>([
  "email_marketing.create_campaign",
  "invoices.create_via_dashboard",
  "dashboard_ui.perform_named_workflow",
]);

async function start() {
  const cfg = loadConfig();
  const logger = createLogger({
    level: cfg.MCP_LOG_LEVEL,
    service: "dashboard-bridge",
    destinationFd: 1,
  });

  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true, service: "dashboard-bridge" }));

  app.get("/bridge/ops", async () => ({
    ok: true,
    operations: Array.from(OPERATIONS).sort(),
  }));

  app.post("/bridge/invoke", async (req, reply) => {
    const token = req.headers["x-bridge-token"];
    if (!cfg.DASHBOARD_BRIDGE_TOKEN || token !== cfg.DASHBOARD_BRIDGE_TOKEN) {
      return reply.code(401).send({ error: "Invalid bridge token" });
    }
    const body = req.body as { op?: string; args?: unknown };
    if (!body.op || !OPERATIONS.has(body.op)) {
      return reply.code(404).send({ error: `Unknown bridge op '${body.op}'` });
    }
    logger.info({ op: body.op }, "bridge.invoke");
    // Real implementation: dispatch to dashboard-page handlers via postMessage
    // or Wix dashboard SDK. This stub returns a structured "not implemented"
    // payload so the MCP layer can surface it to the agent.
    return {
      ok: false,
      op: body.op,
      reason: "not_implemented",
      humanSummary: `Dashboard-bridge op '${body.op}' is registered but not implemented yet.`,
    };
  });

  const port = 3001;
  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "dashboard-bridge listening");
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal:", err);
  process.exit(1);
});
