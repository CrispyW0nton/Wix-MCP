import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@wix-mcp/executors";
import type { ToolMetadata } from "@wix-mcp/tool-definitions";
import type { IdentityAssertion, SiteCapabilityMap } from "@wix-mcp/shared-types";

const baseFlags = {
  dashboardBridgeEnabled: false,
  browserAutomationEnabled: false,
  destructiveWritesEnabled: false,
};

const baseIdentity = (over: Partial<IdentityAssertion> = {}): IdentityAssertion => ({
  identity: "wix_app",
  scopes: [],
  scopeLevel: "site",
  appInstanceId: "inst_1",
  ...over,
});

const baseMeta = (over: Partial<ToolMetadata> = {}): ToolMetadata => ({
  name: "test.tool",
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
  ...over,
});

const supportedMap = (mod: keyof SiteCapabilityMap["modules"]): SiteCapabilityMap => ({
  siteId: "site_1",
  appInstanceId: "inst_1",
  fetchedAt: new Date().toISOString(),
  modules: {
    stores: "unknown",
    bookings: "unknown",
    pricingPlans: "unknown",
    events: "unknown",
    members: "unknown",
    cms: "unknown",
    media: "unknown",
    emailMarketing: "unknown",
    inbox: "unknown",
    automations: "unknown",
    domains: "unknown",
    seo: "unknown",
    [mod]: "supported",
  } as SiteCapabilityMap["modules"],
  inboxChannels: [],
  emailMarketing: { hasVerifiedSender: false, accountActive: false },
  toolOverrides: {},
});

describe("evaluatePolicy", () => {
  it("rejects identity mismatch", () => {
    expect(() =>
      evaluatePolicy({
        metadata: baseMeta({ requiredIdentity: "api_key_admin" }),
        capabilityMap: undefined,
        identity: baseIdentity(),
        flags: baseFlags,
        hasConfirm: false,
        isDryRun: false,
      }),
    ).toThrow(/requires identity/);
  });

  it("rejects high-risk tools without flag", () => {
    expect(() =>
      evaluatePolicy({
        metadata: baseMeta({ riskLevel: "high" }),
        capabilityMap: undefined,
        identity: baseIdentity(),
        flags: baseFlags,
        hasConfirm: true,
        isDryRun: false,
      }),
    ).toThrow(/high-risk/);
  });

  it("allows high-risk dryRun even without flag", () => {
    const decision = evaluatePolicy({
      metadata: baseMeta({ riskLevel: "high" }),
      capabilityMap: undefined,
      identity: baseIdentity(),
      flags: baseFlags,
      hasConfirm: false,
      isDryRun: true,
    });
    expect(decision.backend).toBe("api");
  });

  it("rejects confirm-required tool when confirm missing", () => {
    expect(() =>
      evaluatePolicy({
        metadata: baseMeta({ confirmRequired: true }),
        capabilityMap: undefined,
        identity: baseIdentity(),
        flags: baseFlags,
        hasConfirm: false,
        isDryRun: false,
      }),
    ).toThrow(/confirm: true/);
  });

  it("rejects unsupported capability", () => {
    const map: SiteCapabilityMap = {
      ...supportedMap("stores"),
      modules: {
        ...supportedMap("stores").modules,
        stores: "unsupported",
      },
    };
    expect(() =>
      evaluatePolicy({
        metadata: baseMeta({ requiredModules: ["stores"] }),
        capabilityMap: map,
        identity: baseIdentity(),
        flags: baseFlags,
        hasConfirm: false,
        isDryRun: false,
      }),
    ).toThrow(/not enabled/);
  });

  it("picks api backend when available and warns on partial", () => {
    const map = supportedMap("stores");
    const decision = evaluatePolicy({
      metadata: baseMeta({ requiredModules: ["stores", "members"] }),
      capabilityMap: map,
      identity: baseIdentity(),
      flags: baseFlags,
      hasConfirm: false,
      isDryRun: false,
    });
    expect(decision.backend).toBe("api");
    expect(decision.capabilityStatus).toBe("partial");
    expect(decision.warnings.join(" ")).toMatch(/partial/);
  });

  it("falls back to dashboard_bridge when api not declared", () => {
    const decision = evaluatePolicy({
      metadata: baseMeta({ backends: ["dashboard_bridge", "browser_automation"] }),
      capabilityMap: undefined,
      identity: baseIdentity(),
      flags: { ...baseFlags, dashboardBridgeEnabled: true },
      hasConfirm: false,
      isDryRun: false,
    });
    expect(decision.backend).toBe("dashboard_bridge");
  });

  it("rejects when only fallback backends declared but no flag", () => {
    expect(() =>
      evaluatePolicy({
        metadata: baseMeta({ backends: ["dashboard_bridge", "browser_automation"] }),
        capabilityMap: undefined,
        identity: baseIdentity(),
        flags: baseFlags,
        hasConfirm: false,
        isDryRun: false,
      }),
    ).toThrow(/no enabled backend/);
  });
});
