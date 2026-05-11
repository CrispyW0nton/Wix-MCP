import type { WixHttpClient } from "../httpClient.js";

/**
 * Wix eCommerce Orders API.
 * Reference: /ecom/v1/orders, /ecom/v1/orders/{id},
 * /ecom/v1/orders/{id}/transactions/{check-refundability,refund,capture,void,update-payment-status}.
 *
 * The path layout follows the Wix Order Billing surface where each finance
 * action is an RPC on the order's transactions sub-resource.
 */
export type EcomPaymentStatus =
  | "UNSPECIFIED"
  | "NOT_PAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "FULLY_REFUNDED"
  | "PENDING";

/**
 * Status values mirror the Wix Payment Transactions surface.
 *
 * The agent-facing "is this transaction capturable / voidable / refundable"
 * decision lives in the plan tools, not here.
 */
export type TransactionStatus =
  | "PENDING"
  | "APPROVED"
  | "AUTHORIZED"
  | "CAPTURED"
  | "VOIDED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "FAILED"
  | "DECLINED";

export type TransactionType = "AUTHORIZATION" | "SALE" | "CAPTURE" | "VOID" | "REFUND";

export interface EcomMoney {
  amount?: string;
  currency?: string;
  formattedAmount?: string;
}

export interface EcomOrder {
  id: string;
  number?: string;
  buyerInfo?: {
    contactId?: string;
    email?: string;
  };
  paymentStatus?: EcomPaymentStatus;
  fulfillmentStatus?: string;
  totals?: {
    subtotal?: EcomMoney;
    total?: EcomMoney;
    refundedAmount?: EcomMoney;
  };
  createdDate?: string;
}

export interface OrderTransaction {
  id: string;
  type?: TransactionType;
  status?: TransactionStatus;
  amount?: EcomMoney;
  capturedAmount?: EcomMoney;
  refundedAmount?: EcomMoney;
  paymentMethod?: string;
  providerTransactionId?: string;
  createdDate?: string;
}

export interface ListOrdersResponse {
  orders: EcomOrder[];
  metadata?: { cursors?: { next?: string }; total?: number };
}

export interface ListOrdersArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  cursor?: string;
  limit?: number;
  paymentStatus?: EcomPaymentStatus;
}

export interface GetOrderArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  orderId: string;
}

export interface GetOrderResponse {
  order: EcomOrder;
}

export interface ListTransactionsArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  orderId: string;
}

export interface ListTransactionsResponse {
  transactions: OrderTransaction[];
}

export interface RefundabilityResponse {
  /**
   * Per-transaction refundability. The MCP refund_plan tool synthesizes
   * a top-level summary from this list.
   */
  transactions: {
    id: string;
    refundable: boolean;
    refundableAmount?: EcomMoney;
    nonRefundableReason?: string;
  }[];
}

export interface CheckRefundabilityArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  orderId: string;
}

export interface RefundLineItem {
  transactionId: string;
  amount: { amount: string; currency: string };
}

export interface RefundArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  idempotencyKey?: string;
  orderId: string;
  refunds: RefundLineItem[];
  reason?: string;
  /** When true, Wix sends the standard refund-confirmation email to the buyer. */
  notifyBuyer?: boolean;
}

export interface RefundResponse {
  refunds: {
    id: string;
    amount?: EcomMoney;
    status?: string;
  }[];
  paymentStatus?: EcomPaymentStatus;
}

export interface CaptureArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  idempotencyKey?: string;
  orderId: string;
  /** Optional partial-capture amount; omit for full capture. */
  amount?: { amount: string; currency: string };
  /** Restrict to a single transaction; omit to let Wix pick the eligible one. */
  transactionId?: string;
}

export interface CaptureResponse {
  transaction: OrderTransaction;
  paymentStatus?: EcomPaymentStatus;
}

export interface VoidArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  idempotencyKey?: string;
  orderId: string;
  transactionId: string;
  reason?: string;
}

export interface VoidResponse {
  transaction: OrderTransaction;
  paymentStatus?: EcomPaymentStatus;
}

export interface UpdatePaymentStatusArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  idempotencyKey?: string;
  orderId: string;
  paymentStatus: EcomPaymentStatus;
}

export interface UpdatePaymentStatusResponse {
  order: EcomOrder;
}

export interface EcomOrdersClient {
  list(args: ListOrdersArgs): Promise<ListOrdersResponse>;
  getOrder(args: GetOrderArgs): Promise<GetOrderResponse>;
  listTransactions(args: ListTransactionsArgs): Promise<ListTransactionsResponse>;
  checkRefundability(args: CheckRefundabilityArgs): Promise<RefundabilityResponse>;
  refund(args: RefundArgs): Promise<RefundResponse>;
  capture(args: CaptureArgs): Promise<CaptureResponse>;
  void(args: VoidArgs): Promise<VoidResponse>;
  updatePaymentStatus(args: UpdatePaymentStatusArgs): Promise<UpdatePaymentStatusResponse>;
}

export class WixEcomOrdersClient implements EcomOrdersClient {
  constructor(private readonly http: WixHttpClient) {}

  async list(args: ListOrdersArgs): Promise<ListOrdersResponse> {
    const query: Record<string, string | number | undefined> = {};
    if (args.limit !== undefined) query["paging.limit"] = args.limit;
    if (args.cursor !== undefined) query["cursorPaging.cursor"] = args.cursor;
    if (args.paymentStatus !== undefined) query["filter.paymentStatus"] = args.paymentStatus;
    return this.http.send<ListOrdersResponse>({
      method: "GET",
      path: "/ecom/v1/orders",
      query,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
    });
  }

  async getOrder(args: GetOrderArgs): Promise<GetOrderResponse> {
    return this.http.send<GetOrderResponse>({
      method: "GET",
      path: `/ecom/v1/orders/${encodeURIComponent(args.orderId)}`,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
    });
  }

  async listTransactions(args: ListTransactionsArgs): Promise<ListTransactionsResponse> {
    return this.http.send<ListTransactionsResponse>({
      method: "GET",
      path: `/ecom/v1/orders/${encodeURIComponent(args.orderId)}/transactions`,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
    });
  }

  async checkRefundability(args: CheckRefundabilityArgs): Promise<RefundabilityResponse> {
    return this.http.send<RefundabilityResponse>({
      method: "POST",
      path: `/ecom/v1/orders/${encodeURIComponent(args.orderId)}/transactions/check-refundability`,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
      body: {},
    });
  }

  async refund(args: RefundArgs): Promise<RefundResponse> {
    const body: Record<string, unknown> = {
      refunds: args.refunds,
    };
    if (args.reason !== undefined) body["reason"] = args.reason;
    if (args.notifyBuyer !== undefined) body["sideEffects"] = { sendOrderRefundedEmail: args.notifyBuyer };
    return this.http.send<RefundResponse>({
      method: "POST",
      path: `/ecom/v1/orders/${encodeURIComponent(args.orderId)}/transactions/refund`,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      body,
    });
  }

  async capture(args: CaptureArgs): Promise<CaptureResponse> {
    const body: Record<string, unknown> = {};
    if (args.amount !== undefined) body["amount"] = args.amount;
    if (args.transactionId !== undefined) body["transactionId"] = args.transactionId;
    return this.http.send<CaptureResponse>({
      method: "POST",
      path: `/ecom/v1/orders/${encodeURIComponent(args.orderId)}/transactions/capture`,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      body,
    });
  }

  async void(args: VoidArgs): Promise<VoidResponse> {
    const body: Record<string, unknown> = { transactionId: args.transactionId };
    if (args.reason !== undefined) body["reason"] = args.reason;
    return this.http.send<VoidResponse>({
      method: "POST",
      path: `/ecom/v1/orders/${encodeURIComponent(args.orderId)}/transactions/void`,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      body,
    });
  }

  async updatePaymentStatus(
    args: UpdatePaymentStatusArgs,
  ): Promise<UpdatePaymentStatusResponse> {
    return this.http.send<UpdatePaymentStatusResponse>({
      method: "POST",
      path: `/ecom/v1/orders/${encodeURIComponent(args.orderId)}/transactions/update-payment-status`,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      body: { paymentStatus: args.paymentStatus },
    });
  }
}
