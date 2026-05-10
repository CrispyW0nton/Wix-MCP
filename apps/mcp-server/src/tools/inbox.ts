import { z } from "zod";
import { buildResult, CapabilityError } from "@wix-mcp/core";
import {
  PagingSchema,
  SiteContextSchema,
  type ToolDefinition,
} from "@wix-mcp/tool-definitions";

export const listConversationsTool: ToolDefinition = {
  metadata: {
    name: "inbox.list_conversations",
    description:
      "List Wix Inbox conversations across all enabled channels (Wix Chat, SMS, Facebook, etc).",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["INBOX.READ"],
    riskLevel: "read",
    requiredModules: ["inbox"],
    supportsDryRun: false,
    confirmRequired: false,
    idempotent: true,
    tags: ["inbox", "messaging"],
  },
  inputSchema: z.object({ site: SiteContextSchema }).merge(PagingSchema),
  handler: async (ctx, input) => {
    const i = input as {
      site: { siteId?: string; appInstanceId?: string };
      cursor?: string;
      limit?: number;
    };
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const res = await ctx.services.inbox.listConversations({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      ...(i.cursor !== undefined ? { cursor: i.cursor } : {}),
      ...(i.limit !== undefined ? { limit: i.limit } : {}),
    });
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Fetched ${res.conversations.length} conversations.`,
      data: res,
      correlationId: ctx.correlationId,
      nextSuggestedTools: ["inbox.send_message"],
    });
  },
};

const SendMessageInputSchema = z.object({
  site: SiteContextSchema,
  conversationId: z.string().min(1),
  channel: z
    .enum(["WIX_CHAT", "SMS", "FACEBOOK", "INSTAGRAM", "EMAIL", "OTHER"])
    .optional(),
  message: z.union([
    z.object({ text: z.string().min(1) }),
    z.object({ html: z.string().min(1) }),
  ]),
  idempotencyKey: z.string().min(8).optional(),
});

export const sendMessageTool: ToolDefinition = {
  metadata: {
    name: "inbox.send_message",
    description:
      "Send a message in a Wix Inbox conversation. Channel availability (e.g. SMS) is gated by the per-site capability map.",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["INBOX.MODIFY"],
    riskLevel: "low",
    requiredModules: ["inbox"],
    supportsDryRun: false,
    confirmRequired: false,
    idempotent: true,
    tags: ["inbox", "messaging", "write"],
  },
  inputSchema: SendMessageInputSchema,
  handler: async (ctx, input) => {
    const i = input as z.infer<typeof SendMessageInputSchema>;
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    if (i.channel) {
      const map = await ctx.capabilityFor(site.appInstanceId);
      if (
        map.inboxChannels.length > 0 &&
        !map.inboxChannels.includes(i.channel)
      ) {
        throw new CapabilityError(
          `Channel '${i.channel}' is not enabled on this site. Available: [${map.inboxChannels.join(", ")}].`,
        );
      }
    }
    const res = await ctx.services.inbox.sendMessage({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
      conversationId: i.conversationId,
      ...(i.channel !== undefined ? { channel: i.channel } : {}),
      message: i.message,
    });
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Message ${res.message.id} sent in conversation ${res.message.conversationId}.`,
      data: res,
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
    });
  },
};
