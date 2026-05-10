import { z } from "zod";
import { buildResult } from "@wix-mcp/core";
import {
  PagingSchema,
  SiteContextSchema,
  type ToolDefinition,
} from "@wix-mcp/tool-definitions";

const PaymentStatusSchema = z.enum([
  "UNSPECIFIED",
  "NOT_PAID",
  "PARTIALLY_PAID",
  "PAID",
  "PARTIALLY_REFUNDED",
  "FULLY_REFUNDED",
  "PENDING",
]);

export const listOrdersTool: ToolDefinition = {
  metadata: {
    name: "ecom_orders.list",
    description: "List eCommerce orders for a site, with optional payment-status filter.",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["ECOM.ORDERS.READ"],
    riskLevel: "read",
    requiredModules: ["stores"],
    supportsDryRun: false,
    confirmRequired: false,
    idempotent: true,
    tags: ["ecommerce", "orders"],
  },
  inputSchema: z
    .object({ site: SiteContextSchema, paymentStatus: PaymentStatusSchema.optional() })
    .merge(PagingSchema),
  handler: async (ctx, input) => {
    const i = input as {
      site: { siteId?: string; appInstanceId?: string };
      paymentStatus?: z.infer<typeof PaymentStatusSchema>;
      cursor?: string;
      limit?: number;
    };
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const res = await ctx.services.ecomOrders.list({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      ...(i.cursor !== undefined ? { cursor: i.cursor } : {}),
      ...(i.limit !== undefined ? { limit: i.limit } : {}),
      ...(i.paymentStatus !== undefined ? { paymentStatus: i.paymentStatus } : {}),
    });
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Fetched ${res.orders.length} order(s).`,
      data: res,
      correlationId: ctx.correlationId,
      nextSuggestedTools: ["ecom_orders.refund_plan"],
    });
  },
};

export const refundPlanTool: ToolDefinition = {
  metadata: {
    name: "ecom_orders.refund_plan",
    description:
      "Plan a refund for an eCommerce order. Read-only: returns refundability per transaction so the agent can confirm before executing.",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["ECOM.ORDERS.READ"],
    riskLevel: "low",
    requiredModules: ["stores"],
    supportsDryRun: true,
    confirmRequired: false,
    idempotent: true,
    tags: ["ecommerce", "orders", "refund", "plan"],
  },
  inputSchema: z.object({ site: SiteContextSchema, orderId: z.string().min(1) }),
  handler: async (ctx, input) => {
    const i = input as { site: { siteId?: string; appInstanceId?: string }; orderId: string };
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const refundability = await ctx.services.ecomOrders.checkRefundability({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      orderId: i.orderId,
    });
    const refundableTxns = refundability.transactions.filter((t) => t.refundable);
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Order ${i.orderId}: ${refundableTxns.length}/${refundability.transactions.length} transaction(s) refundable.`,
      data: refundability,
      warnings:
        refundableTxns.length === 0
          ? ["No refundable transactions on this order."]
          : [],
      correlationId: ctx.correlationId,
      nextSuggestedTools: ["ecom_orders.refund_execute"],
    });
  },
};
