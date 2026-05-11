import { describe, expect, it, vi } from "vitest";
import { HybridRouter, type FeatureFlags } from "@wix-mcp/executors";
import { CapabilityRegistry } from "@wix-mcp/capability-registry";
import { NoopAuditSink } from "@wix-mcp/audit";
import type { ToolServices } from "@wix-mcp/tool-definitions";
import type { IdentityResolver } from "@wix-mcp/wix-auth";
import type {
  AppInstanceClient,
  AutomationsClient,
  ContactsClient,
  EcomOrdersClient,
  EmailMarketingClient,
  InboxClient,
  PricingPlansClient,
  SiteContextResolver,
} from "@wix-mcp/wix-clients";
import {
  capturePaymentExecuteTool,
  refundExecuteTool,
  updatePaymentStatusTool,
  voidPaymentExecuteTool,
} from "../apps/mcp-server/src/tools/ecomOrders.js";

interface Harness {
  router: HybridRouter;
  ecom: {
    refund: ReturnType<typeof vi.fn>;
    capture: ReturnType<typeof vi.fn>;
    void: ReturnType<typeof vi.fn>;
    updatePaymentStatus: ReturnType<typeof vi.fn>;
    checkRefundability: ReturnType<typeof vi.fn>;
    listTransactions: ReturnType<typeof vi.fn>;
  };
}

function makeHarness(flags: Partial<FeatureFlags> = {}): Harness {
  const appInstance: AppInstanceClient = {
    getAppInstance: vi.fn().mockResolvedValue({
      instance: { instanceId: "inst_1", permissions: ["STORES.READ", "STORES.MODIFY"] },
      site: { siteId: "site_1" },
    }),
  };

  const ecom = {
    refund: vi.fn().mockResolvedValue({
      refunds: [{ id: "rf_1", status: "PROCESSED", amount: { amount: "10.00", currency: "USD" } }],
      paymentStatus: "PARTIALLY_REFUNDED",
    }),
    capture: vi.fn().mockResolvedValue({
      transaction: { id: "tx_1", status: "CAPTURED" },
      paymentStatus: "PAID",
    }),
    void: vi.fn().mockResolvedValue({
      transaction: { id: "tx_1", status: "VOIDED" },
    }),
    updatePaymentStatus: vi.fn().mockResolvedValue({
      order: { id: "order_1", paymentStatus: "PAID" },
    }),
    checkRefundability: vi.fn().mockResolvedValue({
      transactions: [
        {
          id: "tx_1",
          refundable: true,
          refundableAmount: { amount: "100.00", currency: "USD" },
        },
      ],
    }),
    listTransactions: vi.fn().mockResolvedValue({
      transactions: [{ id: "tx_1", status: "AUTHORIZED" }],
    }),
  };

  const ecomClient = {
    list: vi.fn(),
    getOrder: vi.fn(),
    listTransactions: ecom.listTransactions,
    checkRefundability: ecom.checkRefundability,
    refund: ecom.refund,
    capture: ecom.capture,
    void: ecom.void,
    updatePaymentStatus: ecom.updatePaymentStatus,
  } as unknown as EcomOrdersClient;

  const services: ToolServices = {
    appInstance,
    contacts: {} as ContactsClient,
    inbox: {} as InboxClient,
    emailMarketing: {} as EmailMarketingClient,
    ecomOrders: ecomClient,
    pricingPlans: {} as PricingPlansClient,
    automations: {} as AutomationsClient,
    siteContext: {
      resolve: vi.fn().mockResolvedValue({
        siteId: "site_1",
        appInstanceId: "inst_1",
        label: "site_1",
      }),
    } as unknown as SiteContextResolver,
  };

  const identityResolver = {
    resolve: vi.fn().mockResolvedValue({
      identity: "wix_app",
      scopes: [],
      scopeLevel: "site",
      appInstanceId: "inst_1",
    }),
  } as unknown as IdentityResolver;

  const router = new HybridRouter({
    identityResolver,
    capabilityRegistry: new CapabilityRegistry({
      appInstance,
      cacheTtlMs: 60_000,
    }),
    services,
    audit: new NoopAuditSink(),
    flags: {
      dashboardBridgeEnabled: false,
      browserAutomationEnabled: false,
      destructiveWritesEnabled: false,
      ...flags,
    },
  });

  return { router, ecom };
}

describe("refund_execute", () => {
  it("dryRun: skips the refund call and returns the plan", async () => {
    const { router, ecom } = makeHarness();
    const result = await router.execute(refundExecuteTool, {
      site: { appInstanceId: "inst_1" },
      orderId: "order_1",
      refunds: [{ transactionId: "tx_1", amount: { amount: "10.00", currency: "USD" } }],
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(result.humanSummary).toMatch(/Dry run/);
    expect(ecom.refund).not.toHaveBeenCalled();
    expect(ecom.checkRefundability).toHaveBeenCalledTimes(1);
  });

  it("rejects when destructive writes flag is off and not a dryRun", async () => {
    const { router, ecom } = makeHarness();
    await expect(
      router.execute(refundExecuteTool, {
        site: { appInstanceId: "inst_1" },
        orderId: "order_1",
        confirm: true,
        refunds: [{ transactionId: "tx_1", amount: { amount: "10.00", currency: "USD" } }],
      }),
    ).rejects.toThrow(/high-risk/i);
    expect(ecom.refund).not.toHaveBeenCalled();
  });

  it("rejects when confirm is missing even with destructive writes enabled", async () => {
    const { router, ecom } = makeHarness({ destructiveWritesEnabled: true });
    await expect(
      router.execute(refundExecuteTool, {
        site: { appInstanceId: "inst_1" },
        orderId: "order_1",
        refunds: [{ transactionId: "tx_1", amount: { amount: "10.00", currency: "USD" } }],
      }),
    ).rejects.toThrow(/confirm: true/);
    expect(ecom.refund).not.toHaveBeenCalled();
  });

  it("rejects refund line items that exceed refundable amount", async () => {
    const { router, ecom } = makeHarness({ destructiveWritesEnabled: true });
    await expect(
      router.execute(refundExecuteTool, {
        site: { appInstanceId: "inst_1" },
        orderId: "order_1",
        confirm: true,
        refunds: [
          { transactionId: "tx_1", amount: { amount: "999.00", currency: "USD" } },
        ],
      }),
    ).rejects.toThrow(/exceeds refundable/);
    expect(ecom.refund).not.toHaveBeenCalled();
  });

  it("rejects refund line items targeting unknown transactions", async () => {
    const { router, ecom } = makeHarness({ destructiveWritesEnabled: true });
    await expect(
      router.execute(refundExecuteTool, {
        site: { appInstanceId: "inst_1" },
        orderId: "order_1",
        confirm: true,
        refunds: [{ transactionId: "tx_unknown", amount: { amount: "1.00", currency: "USD" } }],
      }),
    ).rejects.toThrow(/not on order/);
    expect(ecom.refund).not.toHaveBeenCalled();
  });

  it("calls refund when confirm + flag are set and amounts are valid", async () => {
    const { router, ecom } = makeHarness({ destructiveWritesEnabled: true });
    const result = await router.execute(refundExecuteTool, {
      site: { appInstanceId: "inst_1" },
      orderId: "order_1",
      confirm: true,
      refunds: [{ transactionId: "tx_1", amount: { amount: "10.00", currency: "USD" } }],
    });
    expect(result.ok).toBe(true);
    expect(ecom.refund).toHaveBeenCalledTimes(1);
    expect(result.idempotencyKey).toBeDefined();
  });
});

describe("capture_payment_execute", () => {
  it("dryRun does not capture", async () => {
    const { router, ecom } = makeHarness();
    const result = await router.execute(capturePaymentExecuteTool, {
      site: { appInstanceId: "inst_1" },
      orderId: "order_1",
      transactionId: "tx_1",
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(ecom.capture).not.toHaveBeenCalled();
  });

  it("captures when guards pass", async () => {
    const { router, ecom } = makeHarness({ destructiveWritesEnabled: true });
    const result = await router.execute(capturePaymentExecuteTool, {
      site: { appInstanceId: "inst_1" },
      orderId: "order_1",
      transactionId: "tx_1",
      confirm: true,
    });
    expect(result.ok).toBe(true);
    expect(ecom.capture).toHaveBeenCalledTimes(1);
  });
});

describe("void_payment_execute", () => {
  it("voids when guards pass", async () => {
    const { router, ecom } = makeHarness({ destructiveWritesEnabled: true });
    const result = await router.execute(voidPaymentExecuteTool, {
      site: { appInstanceId: "inst_1" },
      orderId: "order_1",
      transactionId: "tx_1",
      confirm: true,
    });
    expect(result.ok).toBe(true);
    expect(ecom.void).toHaveBeenCalledTimes(1);
  });
});

describe("update_payment_status", () => {
  it("requires confirm: true", async () => {
    const { router, ecom } = makeHarness();
    await expect(
      router.execute(updatePaymentStatusTool, {
        site: { appInstanceId: "inst_1" },
        orderId: "order_1",
        paymentStatus: "PAID",
      }),
    ).rejects.toThrow(/confirm: true/);
    expect(ecom.updatePaymentStatus).not.toHaveBeenCalled();
  });

  it("updates status when confirmed", async () => {
    const { router, ecom } = makeHarness();
    const result = await router.execute(updatePaymentStatusTool, {
      site: { appInstanceId: "inst_1" },
      orderId: "order_1",
      paymentStatus: "PAID",
      confirm: true,
    });
    expect(result.ok).toBe(true);
    expect(ecom.updatePaymentStatus).toHaveBeenCalledTimes(1);
  });
});
