import { z } from "zod";
import { buildResult, ValidationError } from "@wix-mcp/core";
import {
  PagingSchema,
  SiteContextSchema,
  type ToolDefinition,
} from "@wix-mcp/tool-definitions";
import type {
  OrderTransaction,
  RefundLineItem,
  TransactionStatus,
} from "@wix-mcp/wix-clients";

const PaymentStatusSchema = z.enum([
  "UNSPECIFIED",
  "NOT_PAID",
  "PARTIALLY_PAID",
  "PAID",
  "PARTIALLY_REFUNDED",
  "FULLY_REFUNDED",
  "PENDING",
]);

const MoneySchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Decimal string, e.g. '12.34'"),
  currency: z.string().length(3, "ISO 4217 currency code"),
});

const RefundLineItemSchema = z.object({
  transactionId: z.string().min(1),
  amount: MoneySchema,
});

/**
 * Per-tool helpers for transaction-state classification. Kept here (not in
 * the typed client) because the rules represent agent-facing policy, not
 * Wix wire shape.
 */
const CAPTURABLE_STATUSES: TransactionStatus[] = ["AUTHORIZED", "APPROVED"];
const VOIDABLE_STATUSES: TransactionStatus[] = ["AUTHORIZED", "APPROVED", "PENDING"];

function classifyTransactions(
  transactions: OrderTransaction[],
  eligibleStatuses: TransactionStatus[],
) {
  const eligible: OrderTransaction[] = [];
  const ineligible: { transaction: OrderTransaction; reason: string }[] = [];
  for (const t of transactions) {
    if (!t.status) {
      ineligible.push({ transaction: t, reason: "Transaction has no status." });
      continue;
    }
    if (eligibleStatuses.includes(t.status)) {
      eligible.push(t);
    } else {
      ineligible.push({
        transaction: t,
        reason: `Status '${t.status}' is not in [${eligibleStatuses.join(", ")}].`,
      });
    }
  }
  return { eligible, ineligible };
}

function decimalLessOrEqual(a: string, b: string): boolean {
  const [ai, af = ""] = a.split(".");
  const [bi, bf = ""] = b.split(".");
  if (!ai || !bi) return false;
  const aPad = af.padEnd(8, "0");
  const bPad = bf.padEnd(8, "0");
  if (ai.length !== bi.length) return ai.length < bi.length;
  if (ai !== bi) return ai < bi;
  return aPad <= bPad;
}

// ---------------------------------------------------------------------------
// Existing tools (unchanged shape) — kept so the registry continues to work.
// ---------------------------------------------------------------------------

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
      nextSuggestedTools: ["ecom_orders.get_order", "ecom_orders.refund_plan"],
    });
  },
};

export const getOrderTool: ToolDefinition = {
  metadata: {
    name: "ecom_orders.get_order",
    description: "Fetch a single eCommerce order with totals, payment, and fulfillment state.",
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
  inputSchema: z.object({ site: SiteContextSchema, orderId: z.string().min(1) }),
  handler: async (ctx, input) => {
    const i = input as { site: { siteId?: string; appInstanceId?: string }; orderId: string };
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const res = await ctx.services.ecomOrders.getOrder({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      orderId: i.orderId,
    });
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Order ${res.order.id} fetched (paymentStatus=${res.order.paymentStatus ?? "unknown"}).`,
      data: res,
      correlationId: ctx.correlationId,
      nextSuggestedTools: [
        "ecom_orders.refund_plan",
        "ecom_orders.capture_payment_plan",
        "ecom_orders.void_payment_plan",
      ],
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

// ---------------------------------------------------------------------------
// Finance write tools.
// ---------------------------------------------------------------------------

const RefundExecuteInputSchema = z.object({
  site: SiteContextSchema,
  orderId: z.string().min(1),
  refunds: z.array(RefundLineItemSchema).min(1),
  reason: z.string().max(500).optional(),
  notifyBuyer: z.boolean().optional(),
  confirm: z.literal(true).optional(),
  dryRun: z.boolean().optional(),
  idempotencyKey: z.string().min(8).optional(),
});

export const refundExecuteTool: ToolDefinition = {
  metadata: {
    name: "ecom_orders.refund_execute",
    description:
      "Issue a refund against one or more order transactions. High-risk: requires confirm: true and FEATURE_DESTRUCTIVE_WRITES (or use dryRun: true to preview).",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["ECOM.ORDERS.MODIFY"],
    riskLevel: "high",
    requiredModules: ["stores"],
    supportsDryRun: true,
    confirmRequired: true,
    idempotent: true,
    tags: ["ecommerce", "orders", "refund", "execute", "finance"],
  },
  inputSchema: RefundExecuteInputSchema,
  handler: async (ctx, input) => {
    const i = input as z.infer<typeof RefundExecuteInputSchema>;
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);

    // Defensive precheck: the API will refuse over-refunds, but we want a
    // helpful structured warning before we touch the wire.
    const refundability = await ctx.services.ecomOrders.checkRefundability({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      orderId: i.orderId,
    });
    const refundabilityById = new Map(
      refundability.transactions.map((t) => [t.id, t]),
    );

    const warnings: string[] = [];
    for (const r of i.refunds as RefundLineItem[]) {
      const meta = refundabilityById.get(r.transactionId);
      if (!meta) {
        throw new ValidationError(
          `Transaction '${r.transactionId}' is not on order '${i.orderId}'.`,
        );
      }
      if (!meta.refundable) {
        throw new ValidationError(
          `Transaction '${r.transactionId}' is not refundable: ${meta.nonRefundableReason ?? "no reason given"}.`,
        );
      }
      const max = meta.refundableAmount?.amount;
      if (max && !decimalLessOrEqual(r.amount.amount, max)) {
        throw new ValidationError(
          `Refund amount ${r.amount.amount} exceeds refundable ${max} for transaction '${r.transactionId}'.`,
        );
      }
      if (
        meta.refundableAmount?.currency &&
        r.amount.currency !== meta.refundableAmount.currency
      ) {
        warnings.push(
          `Refund currency ${r.amount.currency} does not match transaction currency ${meta.refundableAmount.currency}; Wix may reject.`,
        );
      }
    }

    const planSummary = i.refunds
      .map((r) => `${r.transactionId}: ${r.amount.amount} ${r.amount.currency}`)
      .join("; ");

    if (i.dryRun) {
      return buildResult({
        ok: true,
        backendUsed: "api",
        capabilityStatus: "supported",
        humanSummary: `Dry run: would refund ${planSummary} on order ${i.orderId}.`,
        data: { plan: i.refunds, refundability, site },
        warnings,
        correlationId: ctx.correlationId,
        ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
      });
    }

    const res = await ctx.services.ecomOrders.refund({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
      orderId: i.orderId,
      refunds: i.refunds,
      ...(i.reason !== undefined ? { reason: i.reason } : {}),
      ...(i.notifyBuyer !== undefined ? { notifyBuyer: i.notifyBuyer } : {}),
    });

    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Refunded ${res.refunds.length} transaction(s) on order ${i.orderId}; paymentStatus=${res.paymentStatus ?? "unknown"}.`,
      data: res,
      warnings,
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
    });
  },
};

const CapturePlanInputSchema = z.object({
  site: SiteContextSchema,
  orderId: z.string().min(1),
});

export const capturePaymentPlanTool: ToolDefinition = {
  metadata: {
    name: "ecom_orders.capture_payment_plan",
    description:
      "List which transactions on an order are eligible for capture. Read-only.",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["ECOM.ORDERS.READ"],
    riskLevel: "read",
    requiredModules: ["stores"],
    supportsDryRun: true,
    confirmRequired: false,
    idempotent: true,
    tags: ["ecommerce", "orders", "capture", "plan"],
  },
  inputSchema: CapturePlanInputSchema,
  handler: async (ctx, input) => {
    const i = input as z.infer<typeof CapturePlanInputSchema>;
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const txns = await ctx.services.ecomOrders.listTransactions({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      orderId: i.orderId,
    });
    const { eligible, ineligible } = classifyTransactions(
      txns.transactions,
      CAPTURABLE_STATUSES,
    );
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Order ${i.orderId}: ${eligible.length} capturable / ${ineligible.length} ineligible transaction(s).`,
      data: { eligible, ineligible },
      warnings:
        eligible.length === 0
          ? ["No transactions on this order are in a capturable state."]
          : [],
      correlationId: ctx.correlationId,
      nextSuggestedTools: ["ecom_orders.capture_payment_execute"],
    });
  },
};

const CaptureExecuteInputSchema = z.object({
  site: SiteContextSchema,
  orderId: z.string().min(1),
  transactionId: z.string().min(1).optional(),
  amount: MoneySchema.optional(),
  confirm: z.literal(true).optional(),
  dryRun: z.boolean().optional(),
  idempotencyKey: z.string().min(8).optional(),
});

export const capturePaymentExecuteTool: ToolDefinition = {
  metadata: {
    name: "ecom_orders.capture_payment_execute",
    description:
      "Capture an authorized payment on an order, optionally for a partial amount. High-risk: requires confirm: true and FEATURE_DESTRUCTIVE_WRITES (or dryRun: true).",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["ECOM.ORDERS.MODIFY"],
    riskLevel: "high",
    requiredModules: ["stores"],
    supportsDryRun: true,
    confirmRequired: true,
    idempotent: true,
    tags: ["ecommerce", "orders", "capture", "execute", "finance"],
  },
  inputSchema: CaptureExecuteInputSchema,
  handler: async (ctx, input) => {
    const i = input as z.infer<typeof CaptureExecuteInputSchema>;
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);

    if (i.dryRun) {
      return buildResult({
        ok: true,
        backendUsed: "api",
        capabilityStatus: "supported",
        humanSummary: `Dry run: would capture${i.amount ? ` ${i.amount.amount} ${i.amount.currency}` : " full authorized amount"} on order ${i.orderId}.`,
        data: { plan: i, site },
        correlationId: ctx.correlationId,
        ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
      });
    }

    const res = await ctx.services.ecomOrders.capture({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
      orderId: i.orderId,
      ...(i.transactionId !== undefined ? { transactionId: i.transactionId } : {}),
      ...(i.amount !== undefined ? { amount: i.amount } : {}),
    });

    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Captured transaction ${res.transaction.id} on order ${i.orderId}.`,
      data: res,
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
    });
  },
};

const VoidPlanInputSchema = z.object({
  site: SiteContextSchema,
  orderId: z.string().min(1),
});

export const voidPaymentPlanTool: ToolDefinition = {
  metadata: {
    name: "ecom_orders.void_payment_plan",
    description: "List which transactions on an order are eligible for void. Read-only.",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["ECOM.ORDERS.READ"],
    riskLevel: "read",
    requiredModules: ["stores"],
    supportsDryRun: true,
    confirmRequired: false,
    idempotent: true,
    tags: ["ecommerce", "orders", "void", "plan"],
  },
  inputSchema: VoidPlanInputSchema,
  handler: async (ctx, input) => {
    const i = input as z.infer<typeof VoidPlanInputSchema>;
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const txns = await ctx.services.ecomOrders.listTransactions({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      orderId: i.orderId,
    });
    const { eligible, ineligible } = classifyTransactions(
      txns.transactions,
      VOIDABLE_STATUSES,
    );
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Order ${i.orderId}: ${eligible.length} voidable / ${ineligible.length} ineligible transaction(s).`,
      data: { eligible, ineligible },
      warnings:
        eligible.length === 0
          ? ["No transactions on this order are in a voidable state."]
          : [],
      correlationId: ctx.correlationId,
      nextSuggestedTools: ["ecom_orders.void_payment_execute"],
    });
  },
};

const VoidExecuteInputSchema = z.object({
  site: SiteContextSchema,
  orderId: z.string().min(1),
  transactionId: z.string().min(1),
  reason: z.string().max(500).optional(),
  confirm: z.literal(true).optional(),
  dryRun: z.boolean().optional(),
  idempotencyKey: z.string().min(8).optional(),
});

export const voidPaymentExecuteTool: ToolDefinition = {
  metadata: {
    name: "ecom_orders.void_payment_execute",
    description:
      "Void an authorized payment on a transaction. High-risk: requires confirm: true and FEATURE_DESTRUCTIVE_WRITES (or dryRun: true).",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["ECOM.ORDERS.MODIFY"],
    riskLevel: "high",
    requiredModules: ["stores"],
    supportsDryRun: true,
    confirmRequired: true,
    idempotent: true,
    tags: ["ecommerce", "orders", "void", "execute", "finance"],
  },
  inputSchema: VoidExecuteInputSchema,
  handler: async (ctx, input) => {
    const i = input as z.infer<typeof VoidExecuteInputSchema>;
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);

    if (i.dryRun) {
      return buildResult({
        ok: true,
        backendUsed: "api",
        capabilityStatus: "supported",
        humanSummary: `Dry run: would void transaction ${i.transactionId} on order ${i.orderId}.`,
        data: { plan: i, site },
        correlationId: ctx.correlationId,
        ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
      });
    }

    const res = await ctx.services.ecomOrders.void({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
      orderId: i.orderId,
      transactionId: i.transactionId,
      ...(i.reason !== undefined ? { reason: i.reason } : {}),
    });

    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Voided transaction ${res.transaction.id} on order ${i.orderId}.`,
      data: res,
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
    });
  },
};

const UpdatePaymentStatusInputSchema = z.object({
  site: SiteContextSchema,
  orderId: z.string().min(1),
  paymentStatus: PaymentStatusSchema,
  confirm: z.literal(true).optional(),
  idempotencyKey: z.string().min(8).optional(),
});

export const updatePaymentStatusTool: ToolDefinition = {
  metadata: {
    name: "ecom_orders.update_payment_status",
    description:
      "Manually update the payment status on an order (e.g., mark a manual/offline order as PAID). Medium-risk: requires confirm: true.",
    requiredIdentity: "wix_app",
    backends: ["api"],
    requiredScopes: ["ECOM.ORDERS.MODIFY"],
    riskLevel: "medium",
    requiredModules: ["stores"],
    supportsDryRun: false,
    confirmRequired: true,
    idempotent: false,
    tags: ["ecommerce", "orders", "payment-status", "finance"],
  },
  inputSchema: UpdatePaymentStatusInputSchema,
  handler: async (ctx, input) => {
    const i = input as z.infer<typeof UpdatePaymentStatusInputSchema>;
    const site = await ctx.services.siteContext.resolve(i.site, ctx.correlationId);
    const res = await ctx.services.ecomOrders.updatePaymentStatus({
      appInstanceId: site.appInstanceId,
      ...(site.siteId !== "unknown" ? { siteId: site.siteId } : {}),
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
      orderId: i.orderId,
      paymentStatus: i.paymentStatus,
    });
    return buildResult({
      ok: true,
      backendUsed: "api",
      capabilityStatus: "supported",
      humanSummary: `Order ${res.order.id} paymentStatus set to ${res.order.paymentStatus ?? i.paymentStatus}.`,
      data: res,
      correlationId: ctx.correlationId,
      ...(ctx.idempotencyKey !== undefined ? { idempotencyKey: ctx.idempotencyKey } : {}),
    });
  },
};
