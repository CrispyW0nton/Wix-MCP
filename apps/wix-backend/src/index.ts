import Fastify from "fastify";
import { loadConfig } from "@wix-mcp/config";
import { createLogger } from "@wix-mcp/core";
import {
  ApiKeyAdminProvider,
  InMemoryTokenStore,
  WixOAuthClient,
} from "@wix-mcp/wix-auth";

/**
 * Self-hosted Wix integration backend.
 *
 * Responsibilities:
 *   - Host the OAuth callback for the Wix App.
 *   - Persist app-instance access/refresh tokens.
 *   - Receive Wix webhooks (orders, contacts, automations, etc) and push
 *     into the audit/automation pipeline.
 *
 * For local dev this uses an in-memory token store. Swap in a persistent
 * store (Postgres, Redis, KMS) for production.
 */
async function start() {
  const cfg = loadConfig();
  const logger = createLogger({
    level: cfg.MCP_LOG_LEVEL,
    service: "wix-backend",
    destinationFd: 1,
  });

  const tokenStore = new InMemoryTokenStore();
  const oauth = new WixOAuthClient({
    credentials: { appId: cfg.WIX_APP_ID ?? "", appSecret: cfg.WIX_APP_SECRET ?? "" },
    tokenStore,
  });
  const _apiKeyAdmin = new ApiKeyAdminProvider(
    cfg.WIX_API_KEY && cfg.WIX_ACCOUNT_ID
      ? { apiKey: cfg.WIX_API_KEY, accountId: cfg.WIX_ACCOUNT_ID }
      : undefined,
  );

  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    ok: true,
    service: "wix-backend",
    version: "0.1.0",
  }));

  app.get("/oauth/callback", async (req, reply) => {
    const { code, state, instanceId } = req.query as {
      code?: string;
      state?: string;
      instanceId?: string;
    };
    if (!code || !instanceId) {
      return reply.code(400).send({ error: "Missing code/instanceId" });
    }
    const record = await oauth.exchangeCode({ code, instanceId });
    logger.info({ instanceId, scopes: record.scopes }, "wix.oauth.exchanged");
    return reply.send({ ok: true, instanceId, scopes: record.scopes, state });
  });

  app.post("/webhooks/wix", async (req, _reply) => {
    // TODO: verify Wix webhook JWT using WIX_APP_PUBLIC_KEY. For now, log
    // and acknowledge so we don't drop events during development.
    logger.info({ headers: req.headers, body: req.body }, "wix.webhook.received");
    return { ok: true };
  });

  await app.listen({ port: cfg.WIX_BACKEND_PORT, host: "0.0.0.0" });
  logger.info({ port: cfg.WIX_BACKEND_PORT }, "wix-backend listening");
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal:", err);
  process.exit(1);
});
