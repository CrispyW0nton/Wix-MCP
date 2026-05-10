import { loadConfig } from "@wix-mcp/config";
import { CapabilityRegistry } from "@wix-mcp/capability-registry";
import { createLogger } from "@wix-mcp/core";
import { CompositeAuditSink, FileAuditSink, NoopAuditSink } from "@wix-mcp/audit";
import {
  ApiKeyAdminProvider,
  IdentityResolver,
  InMemoryTokenStore,
  WixOAuthClient,
} from "@wix-mcp/wix-auth";
import {
  SiteContextResolver,
  WixAppInstanceClient,
  WixAutomationsClient,
  WixContactsClient,
  WixEcomOrdersClient,
  WixEmailMarketingClient,
  WixHttpClient,
  WixInboxClient,
  WixPricingPlansClient,
} from "@wix-mcp/wix-clients";
import {
  HybridRouter,
  type FeatureFlags,
} from "@wix-mcp/executors";

export interface Composition {
  router: HybridRouter;
  flags: FeatureFlags;
  shutdown: () => Promise<void>;
}

/**
 * Composition root. Wires every concrete dependency and returns the
 * HybridRouter the MCP server uses to dispatch tool calls.
 *
 * Replace InMemoryTokenStore with a persistent store for production.
 */
export function buildComposition(): Composition {
  const cfg = loadConfig();
  const logger = createLogger({ level: cfg.MCP_LOG_LEVEL, service: "wix-mcp-server" });

  const tokenStore = new InMemoryTokenStore();
  const oauth = new WixOAuthClient({
    credentials: { appId: cfg.WIX_APP_ID ?? "", appSecret: cfg.WIX_APP_SECRET ?? "" },
    tokenStore,
  });
  const apiKeyAdmin = new ApiKeyAdminProvider(
    cfg.WIX_API_KEY && cfg.WIX_ACCOUNT_ID
      ? { apiKey: cfg.WIX_API_KEY, accountId: cfg.WIX_ACCOUNT_ID }
      : undefined,
  );

  const http = new WixHttpClient({
    oauth,
    apiKeyAdmin,
    onRequest: (info) => logger.debug(info, "wix.http.request"),
  });

  const appInstance = new WixAppInstanceClient(http);
  const services = {
    appInstance,
    contacts: new WixContactsClient(http),
    inbox: new WixInboxClient(http),
    emailMarketing: new WixEmailMarketingClient(http),
    ecomOrders: new WixEcomOrdersClient(http),
    pricingPlans: new WixPricingPlansClient(http),
    automations: new WixAutomationsClient(http),
    siteContext: new SiteContextResolver(appInstance),
  };

  const capabilityRegistry = new CapabilityRegistry({
    appInstance,
    cacheTtlMs: cfg.CAPABILITY_CACHE_TTL_SECONDS * 1000,
  });

  const identityResolver = new IdentityResolver({
    oauth,
    apiKeyAdmin,
    dashboardBridgeAvailable: cfg.FEATURE_DASHBOARD_BRIDGE,
  });

  const audit = cfg.AUDIT_SINK_PATH
    ? new CompositeAuditSink([new FileAuditSink(cfg.AUDIT_SINK_PATH)])
    : new NoopAuditSink();

  const flags: FeatureFlags = {
    dashboardBridgeEnabled: cfg.FEATURE_DASHBOARD_BRIDGE,
    browserAutomationEnabled: cfg.FEATURE_BROWSER_AUTOMATION,
    destructiveWritesEnabled: cfg.FEATURE_DESTRUCTIVE_WRITES,
  };

  const router = new HybridRouter({
    identityResolver,
    capabilityRegistry,
    services,
    audit,
    flags,
  });

  return {
    router,
    flags,
    shutdown: async () => {
      logger.info("Shutting down wix-mcp-server.");
    },
  };
}
