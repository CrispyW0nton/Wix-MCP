import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HybridRouter } from "@wix-mcp/executors";
import { CapabilityRegistry } from "@wix-mcp/capability-registry";
import { NoopAuditSink } from "@wix-mcp/audit";
import { buildResult } from "@wix-mcp/core";
import type { ToolDefinition, ToolServices } from "@wix-mcp/tool-definitions";
import type { IdentityResolver } from "@wix-mcp/wix-auth";
import type {
  AppInstanceClient,
  AutomationsClient,
  ContactsClient,
  EcomOrdersClient,
  EmailMarketingClient,
  InboxClient,
  PricingPlansClient,
  SiteContextResolver,
} from "@wix-mcp/wix-clients";

function makeRouter(overrides?: Partial<{ resolveIdentity: ReturnType<typeof vi.fn> }>) {
  const appInstance: AppInstanceClient = {
    getAppInstance: vi.fn().mockResolvedValue({
      instance: { instanceId: "inst_1", permissions: ["STORES.READ"] },
      site: { siteId: "site_1" },
    }),
  };
  const services: ToolServices = {
    appInstance,
    contacts: {} as ContactsClient,
    inbox: {} as InboxClient,
    emailMarketing: {} as EmailMarketingClient,
    ecomOrders: {} as EcomOrdersClient,
    pricingPlans: {} as PricingPlansClient,
    automations: {} as AutomationsClient,
    siteContext: {
      resolve: vi.fn().mockResolvedValue({
        siteId: "site_1",
        appInstanceId: "inst_1",
        label: "site_1",
      }),
    } as unknown as SiteContextResolver,
  };

  const identityResolver = {
    resolve:
      overrides?.resolveIdentity ??
      vi.fn().mockResolvedValue({
        identity: "wix_app",
        scopes: [],
        scopeLevel: "site",
        appInstanceId: "inst_1",
      }),
  } as unknown as IdentityResolver;

  const router = new HybridRouter({
    identityResolver,
    capabilityRegistry: new CapabilityRegistry({
      appInstance,
      cacheTtlMs: 60_000,
    }),
    services,
    audit: new NoopAuditSink(),
    flags: {
      dashboardBridgeEnabled: false,
      browserAutomationEnabled: false,
      destructiveWritesEnabled: false,
    },
  });
  return { router, identityResolver };
}

describe("HybridRouter", () => {
  it("validates input via the tool's zod schema", async () => {
    const tool: ToolDefinition = {
      metadata: {
        name: "test.read",
        description: "test",
        requiredIdentity: "wix_app",
        backends: ["api"],
        requiredScopes: [],
        riskLevel: "read",
        requiredModules: [],
        supportsDryRun: false,
        confirmRequired: false,
        idempotent: true,
        tags: [],
      },
      inputSchema: z.object({ appInstanceId: z.string().min(1) }),
      handler: async (ctx) =>
        buildResult({
          ok: true,
          backendUsed: "api",
          capabilityStatus: "supported",
          humanSummary: "ok",
          data: {},
          correlationId: ctx.correlationId,
        }),
    };
    const { router } = makeRouter();
    await expect(router.execute(tool, {})).rejects.toThrow();
  });

  it("invokes handler and stamps a correlation id", async () => {
    const tool: ToolDefinition = {
      metadata: {
        name: "test.read",
        description: "test",
        requiredIdentity: "wix_app",
        backends: ["api"],
        requiredScopes: [],
        riskLevel: "read",
        requiredModules: [],
        supportsDryRun: false,
        confirmRequired: false,
        idempotent: true,
        tags: [],
      },
      inputSchema: z.object({ appInstanceId: z.string().min(1) }),
      handler: async (ctx) =>
        buildResult({
          ok: true,
          backendUsed: "api",
          capabilityStatus: "supported",
          humanSummary: "ok",
          data: { ping: "pong" },
          correlationId: ctx.correlationId,
        }),
    };
    const { router } = makeRouter();
    const result = await router.execute(tool, { appInstanceId: "inst_1" });
    expect(result.ok).toBe(true);
    expect(result.correlationId).toMatch(/^cor_/);
    expect(result.data).toEqual({ ping: "pong" });
  });
});
