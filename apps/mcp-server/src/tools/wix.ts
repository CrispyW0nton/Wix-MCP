import { z } from "zod";
import { buildResult } from "@wix-mcp/core";
import {
  SiteContextSchema,
  type ToolDefinition,
} from "@wix-mcp/tool-definitions";

export const getCapabilitiesTool: ToolDefinition = {
  metadata: {
    name: "wix.get_capabilities",
    description:
      "Return the capability map for a site (which Wix modules are enabled, which tools are API-backed vs fallback, inbox channels available).",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: [],
    riskLevel: "read",
    requiredModules: [],
    supportsDryRun: false,
    confirmRequired: false,
    idempotent: true,
    tags: ["foundation", "capability"],
  },
  inputSchema: z.object({ site: SiteContextSchema }),
  handler: async (ctx, input) => {
    const i = input as { site: { siteId?: string; appInstanceId?: string } };
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const map = await ctx.capabilityFor(site.appInstanceId || (i.site.appInstanceId ?? ""));
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Capabilities resolved for site ${site.label}.`,
      data: { site, capabilities: map },
      correlationId: ctx.correlationId,
      nextSuggestedTools: ["contacts.list", "ecom_orders.list", "inbox.list_conversations"],
    });
  },
};

export const listSitesTool: ToolDefinition = {
  metadata: {
    name: "wix.list_sites",
    description:
      "List sites known to this MCP control plane (one per persisted app installation in the token store).",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: [],
    riskLevel: "read",
    requiredModules: [],
    supportsDryRun: false,
    confirmRequired: false,
    idempotent: true,
    tags: ["foundation"],
  },
  // Accepts a fake site context to satisfy the router's identity probe.
  // Real implementations should pull from the token store directly.
  inputSchema: z.object({ site: SiteContextSchema }),
  handler: async (ctx) => {
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: "Listing sites is a backend concern; this MCP build returns the active context only.",
      data: {
        sites: ctx.identity.appInstanceId ? [{ appInstanceId: ctx.identity.appInstanceId }] : [],
      },
      warnings: [
        "Multi-tenant site enumeration belongs in apps/wix-backend; this stub returns the current identity only.",
      ],
      correlationId: ctx.correlationId,
    });
  },
};

export const getAppInstanceTool: ToolDefinition = {
  metadata: {
    name: "wix.get_app_instance",
    description:
      "Return the Wix app instance metadata for the current site, including permissions and site profile.",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: [],
    riskLevel: "read",
    requiredModules: [],
    supportsDryRun: false,
    confirmRequired: false,
    idempotent: true,
    tags: ["foundation"],
  },
  inputSchema: z.object({ site: SiteContextSchema }),
  handler: async (ctx, input) => {
    const i = input as { site: { siteId?: string; appInstanceId?: string } };
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const inst = await ctx.services.appInstance.getAppInstance({
      appInstanceId: site.appInstanceId,
      correlationId: ctx.correlationId,
    });
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `App instance for ${site.label}: ${inst.instance?.appName ?? "(unnamed)"}.`,
      data: inst,
      correlationId: ctx.correlationId,
    });
  },
};
