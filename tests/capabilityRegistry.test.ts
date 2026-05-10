import { describe, expect, it, vi } from "vitest";
import {
  CapabilityRegistry,
  evaluateToolCapability,
} from "@wix-mcp/capability-registry";
import type { AppInstance, AppInstanceClient } from "@wix-mcp/wix-clients";

const makeStubClient = (instance: AppInstance): AppInstanceClient => ({
  getAppInstance: vi.fn().mockResolvedValue(instance),
});

describe("CapabilityRegistry", () => {
  it("derives module statuses from app permissions", async () => {
    const stub = makeStubClient({
      instance: { instanceId: "inst_1", permissions: ["STORES.READ", "INBOX.MODIFY"] },
      site: { siteId: "site_1" },
    });
    const reg = new CapabilityRegistry({ appInstance: stub, cacheTtlMs: 60_000 });
    const map = await reg.getForAppInstance("inst_1", "cor_1");
    expect(map.modules.stores).toBe("supported");
    expect(map.modules.inbox).toBe("supported");
    expect(map.modules.bookings).toBe("unknown");
  });

  it("caches results until ttl expires", async () => {
    const stub = makeStubClient({
      instance: { instanceId: "inst_1", permissions: [] },
      site: { siteId: "site_1" },
    });
    const reg = new CapabilityRegistry({ appInstance: stub, cacheTtlMs: 60_000 });
    await reg.getForAppInstance("inst_1", "cor_1");
    await reg.getForAppInstance("inst_1", "cor_1");
    expect(stub.getAppInstance).toHaveBeenCalledTimes(1);
  });

  it("forces a refresh on demand", async () => {
    const stub = makeStubClient({
      instance: { instanceId: "inst_1", permissions: [] },
      site: { siteId: "site_1" },
    });
    const reg = new CapabilityRegistry({ appInstance: stub, cacheTtlMs: 60_000 });
    await reg.getForAppInstance("inst_1", "cor_1");
    await reg.getForAppInstance("inst_1", "cor_1", { force: true });
    expect(stub.getAppInstance).toHaveBeenCalledTimes(2);
  });
});

describe("evaluateToolCapability", () => {
  it("returns supported when all modules are supported", () => {
    expect(
      evaluateToolCapability(
        {
          siteId: "s",
          appInstanceId: "i",
          fetchedAt: "now",
          modules: {
            stores: "supported",
            bookings: "supported",
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
          },
          inboxChannels: [],
          emailMarketing: { hasVerifiedSender: false, accountActive: false },
          toolOverrides: {},
        },
        ["stores", "bookings"],
      ),
    ).toBe("supported");
  });
});
