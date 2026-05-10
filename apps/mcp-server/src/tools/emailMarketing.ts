import { z } from "zod";
import { buildResult } from "@wix-mcp/core";
import {
  PagingSchema,
  SiteContextSchema,
  type ToolDefinition,
} from "@wix-mcp/tool-definitions";

const StatusSchema = z.enum([
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
  "SENT",
  "FAILED",
]);

export const listCampaignsTool: ToolDefinition = {
  metadata: {
    name: "email_marketing.list_campaigns",
    description:
      "List existing email marketing campaigns. NOTE: New campaigns cannot be created from scratch via API; use the dashboard automation fallback for that.",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["EMAIL_MARKETING.READ"],
    riskLevel: "read",
    requiredModules: ["emailMarketing"],
    supportsDryRun: false,
    confirmRequired: false,
    idempotent: true,
    tags: ["email", "marketing"],
  },
  inputSchema: z
    .object({ site: SiteContextSchema, status: StatusSchema.optional() })
    .merge(PagingSchema),
  handler: async (ctx, input) => {
    const i = input as {
      site: { siteId?: string; appInstanceId?: string };
      status?: z.infer<typeof StatusSchema>;
      cursor?: string;
      limit?: number;
    };
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const res = await ctx.services.emailMarketing.listCampaigns({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      ...(i.cursor !== undefined ? { cursor: i.cursor } : {}),
      ...(i.limit !== undefined ? { limit: i.limit } : {}),
      ...(i.status !== undefined ? { status: i.status } : {}),
    });
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Fetched ${res.campaigns.length} email marketing campaign(s).`,
      data: res,
      warnings: [
        "Wix Email Marketing API does not support creating brand-new campaigns via REST.",
      ],
      correlationId: ctx.correlationId,
      nextSuggestedTools: ["email_marketing.send_test", "email_marketing.publish_campaign_plan"],
    });
  },
};
