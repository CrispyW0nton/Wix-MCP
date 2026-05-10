import { ValidationError } from "@wix-mcp/core";
import type {
  ResolvedSiteContext,
  SiteContextInput,
} from "@wix-mcp/shared-types";
import type { AppInstanceClient } from "./domains/appInstance.js";

/**
 * Normalizes any of (siteId, domain, appInstanceId) into a ResolvedSiteContext.
 *
 * The resolver delegates to the App Instance API for the canonical mapping.
 * Results are cached in-process per (input -> resolved) pair to avoid spamming
 * Wix during a single MCP session.
 */
export class SiteContextResolver {
  private readonly cache = new Map<string, ResolvedSiteContext>();

  constructor(private readonly appInstance: AppInstanceClient) {}

  async resolve(
    input: SiteContextInput,
    correlationId: string,
  ): Promise<ResolvedSiteContext> {
    const key = JSON.stringify(input);
    const cached = this.cache.get(key);
    if (cached) return cached;

    if (!input.siteId && !input.domain && !input.appInstanceId) {
      throw new ValidationError(
        "Provide at least one of siteId, domain, or appInstanceId.",
      );
    }

    let resolved: ResolvedSiteContext;
    if (input.appInstanceId) {
      const inst = await this.appInstance.getAppInstance({
        appInstanceId: input.appInstanceId,
        correlationId,
      });
      resolved = {
        siteId: inst.site?.siteId ?? input.siteId ?? "unknown",
        appInstanceId: input.appInstanceId,
        label: inst.site?.siteDisplayName ?? input.appInstanceId,
        ...(inst.site?.accountId !== undefined ? { accountId: inst.site.accountId } : {}),
        ...(inst.site?.url !== undefined ? { domain: inst.site.url } : {}),
      };
    } else {
      // siteId / domain path: we record the input verbatim and let downstream
      // tools require the appInstanceId for app-identity calls. Lookup of
      // appInstanceId by siteId requires the App Management API and is a
      // wix_app-scope concern handled at backend onboarding time.
      resolved = {
        siteId: input.siteId ?? "unknown",
        appInstanceId: "",
        label: input.domain ?? input.siteId ?? "unknown",
        ...(input.domain !== undefined ? { domain: input.domain } : {}),
      };
    }

    this.cache.set(key, resolved);
    return resolved;
  }

  /** Test/dev helper. */
  clearCache(): void {
    this.cache.clear();
  }
}
