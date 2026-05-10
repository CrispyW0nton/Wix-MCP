import type { WixHttpClient } from "../httpClient.js";

/**
 * Wix eCommerce Orders API.
 * Reference: /ecom/v1/orders, /ecom/v1/orders/{id}, /ecom/v1/orders/{id}/refunds
 */
export type EcomPaymentStatus =
  | "UNSPECIFIED"
  | "NOT_PAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "FULLY_REFUNDED"
  | "PENDING";

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

export interface EcomOrdersClient {
  list(args: ListOrdersArgs): Promise<ListOrdersResponse>;
  checkRefundability(args: CheckRefundabilityArgs): Promise<RefundabilityResponse>;
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
}
