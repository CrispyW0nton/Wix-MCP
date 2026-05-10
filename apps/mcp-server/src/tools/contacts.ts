import { z } from "zod";
import { buildResult } from "@wix-mcp/core";
import {
  PagingSchema,
  SiteContextSchema,
  type ToolDefinition,
} from "@wix-mcp/tool-definitions";

const ContactInfoSchema = z.object({
  name: z.object({ first: z.string().optional(), last: z.string().optional() }).optional(),
  emails: z
    .object({
      items: z
        .array(
          z.object({
            tag: z.string().optional(),
            email: z.string().email(),
            primary: z.boolean().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  phones: z
    .object({
      items: z
        .array(
          z.object({
            tag: z.string().optional(),
            phone: z.string().min(3),
            primary: z.boolean().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
});

export const listContactsTool: ToolDefinition = {
  metadata: {
    name: "contacts.list",
    description:
      "List CRM contacts for a site, with cursor pagination and optional text query.",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["CONTACTS.READ"],
    riskLevel: "read",
    requiredModules: ["members"],
    supportsDryRun: false,
    confirmRequired: false,
    idempotent: true,
    tags: ["crm", "contacts"],
  },
  inputSchema: z
    .object({ site: SiteContextSchema, query: z.string().optional() })
    .merge(PagingSchema),
  handler: async (ctx, input) => {
    const i = input as {
      site: { siteId?: string; appInstanceId?: string };
      cursor?: string;
      limit?: number;
      query?: string;
    };
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const res = await ctx.services.contacts.list({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      ...(i.cursor !== undefined ? { cursor: i.cursor } : {}),
      ...(i.limit !== undefined ? { limit: i.limit } : {}),
      ...(i.query !== undefined ? { query: i.query } : {}),
    });
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Fetched ${res.contacts.length} contacts.`,
      data: res,
      correlationId: ctx.correlationId,
      nextSuggestedTools: ["contacts.create", "inbox.list_conversations"],
    });
  },
};

export const createContactTool: ToolDefinition = {
  metadata: {
    name: "contacts.create",
    description:
      "Create a new CRM contact. Idempotency-key-safe; rerunning with the same key is a no-op.",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["CONTACTS.MODIFY"],
    riskLevel: "low",
    requiredModules: ["members"],
    supportsDryRun: true,
    confirmRequired: false,
    idempotent: true,
    tags: ["crm", "contacts", "write"],
  },
  inputSchema: z.object({
    site: SiteContextSchema,
    info: ContactInfoSchema,
    dryRun: z.boolean().optional(),
    idempotencyKey: z.string().min(8).optional(),
  }),
  handler: async (ctx, input) => {
    const i = input as {
      site: { siteId?: string; appInstanceId?: string };
      info: z.infer<typeof ContactInfoSchema>;
      dryRun?: boolean;
      idempotencyKey?: string;
    };
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    if (i.dryRun) {
      return buildResult({
        ok: true,
        backendUsed: "api",
        capabilityStatus: "supported",
        humanSummary: "Dry run: contact would be created.",
        data: { plannedInfo: i.info, site },
        correlationId: ctx.correlationId,
        ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
      });
    }
    const res = await ctx.services.contacts.create({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
      info: i.info,
    });
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Contact ${res.contact.id ?? "(no id returned)"} created.`,
      data: res,
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
    });
  },
};
