import type { WixHttpClient } from "../httpClient.js";

/**
 * Wix Pricing Plans API.
 * Reference: /pricing-plans/v2/orders/{id}/markAsPaid
 */
export interface MarkOfflineOrderPaidArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  idempotencyKey?: string;
  orderId: string;
}

export interface MarkOfflineOrderPaidResponse {
  order: {
    id: string;
    paymentStatus?: string;
  };
}

export interface PricingPlansClient {
  markOfflineOrderPaid(
    args: MarkOfflineOrderPaidArgs,
  ): Promise<MarkOfflineOrderPaidResponse>;
}

export class WixPricingPlansClient implements PricingPlansClient {
  constructor(private readonly http: WixHttpClient) {}

  async markOfflineOrderPaid(args: MarkOfflineOrderPaidArgs) {
    return this.http.send<MarkOfflineOrderPaidResponse>({
      method: "POST",
      path: `/pricing-plans/v2/orders/${encodeURIComponent(args.orderId)}/markAsPaid`,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      body: {},
    });
  }
}
