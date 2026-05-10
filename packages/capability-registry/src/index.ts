import type {
  CapabilityStatus,
  SiteCapabilityMap,
} from "@wix-mcp/shared-types";
import type { AppInstanceClient } from "@wix-mcp/wix-clients";

export interface CapabilityRegistryOptions {
  appInstance: AppInstanceClient;
  cacheTtlMs: number;
}

interface CacheEntry {
  map: SiteCapabilityMap;
  expiresAt: number;
}

/**
 * Builds a per-site capability map. The first version uses the app's installed
 * permissions and known module-naming conventions; deeper probes (e.g., calling
 * /stores/v3/products?limit=1) can be added per module as those clients land.
 *
 * The registry intentionally returns "unknown" rather than guessing: tools
 * gate on supported / partial only, and the agent can request a refresh.
 */
export class CapabilityRegistry {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly opts: CapabilityRegistryOptions) {}

  async getForAppInstance(
    appInstanceId: string,
    correlationId: string,
    opts: { force?: boolean } = {},
  ): Promise<SiteCapabilityMap> {
    const cached = this.cache.get(appInstanceId);
    if (!opts.force && cached && cached.expiresAt > Date.now()) {
      return cached.map;
    }
    const inst = await this.opts.appInstance.getAppInstance({
      appInstanceId,
      correlationId,
    });
    const permissions = new Set(inst.instance?.permissions ?? []);
    const has = (...needles: string[]): CapabilityStatus =>
      needles.some((n) => Array.from(permissions).some((p) => p.includes(n)))
        ? "supported"
        : "unknown";

    const map: SiteCapabilityMap = {
      siteId: inst.site?.siteId ?? "unknown",
      appInstanceId,
      fetchedAt: new Date().toISOString(),
      modules: {
        stores: has("STORES", "stores"),
        bookings: has("BOOKINGS", "bookings"),
        pricingPlans: has("PRICING_PLANS", "pricing-plans", "pricingPlans"),
        events: has("EVENTS", "events"),
        members: has("MEMBERS", "members"),
        cms: has("DATA", "data", "CMS", "cms"),
        media: has("MEDIA", "media"),
        emailMarketing: has("EMAIL_MARKETING", "email-marketing", "emailMarketing"),
        inbox: has("INBOX", "inbox", "MESSAGING", "messaging"),
        automations: has("AUTOMATIONS", "automations"),
        domains: has("DOMAINS", "domains"),
        seo: has("SEO", "seo"),
      },
      inboxChannels: [],
      emailMarketing: { hasVerifiedSender: false, accountActive: false },
      toolOverrides: {},
    };

    this.cache.set(appInstanceId, {
      map,
      expiresAt: Date.now() + this.opts.cacheTtlMs,
    });
    return map;
  }

  /** Force-evict an entry, e.g. after a tool installs a new module. */
  invalidate(appInstanceId: string): void {
    this.cache.delete(appInstanceId);
  }
}

/**
 * Helper: given a tool's required module(s) and a site capability map,
 * decide whether the tool can run, should fall back, or must report
 * unsupported.
 */
export function evaluateToolCapability(
  map: SiteCapabilityMap,
  requiredModules: (keyof SiteCapabilityMap["modules"])[],
): CapabilityStatus {
  const statuses = requiredModules.map((m) => map.modules[m]);
  if (statuses.includes("unsupported")) return "unsupported";
  if (statuses.every((s) => s === "supported")) return "supported";
  if (statuses.some((s) => s === "supported")) return "partial";
  return "unknown";
}
