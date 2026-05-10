import { z } from "zod";
import type {
  BackendType,
  Identity,
  RiskLevel,
  SiteCapabilityMap,
  ToolResult,
} from "@wix-mcp/shared-types";

/**
 * Tool metadata shared by every tool implementation. The MCP server reads
 * this metadata to register tools, gate execution by identity/capability,
 * and route to the right executor.
 */
export interface ToolMetadata {
  /** Stable, namespaced tool name shown to Cursor (e.g. "contacts.list"). */
  name: string;
  /** One-line description shown to the model. */
  description: string;
  /** Auth identity required to execute this tool. */
  requiredIdentity: Identity;
  /** Backend(s) this tool is allowed to use. The first is preferred. */
  backends: BackendType[];
  /** Wix scopes/permissions the underlying app must have. */
  requiredScopes: string[];
  /** Whether this tool reads or writes; informs auditing and confirmations. */
  riskLevel: RiskLevel;
  /** Required modules from the capability map. */
  requiredModules: (keyof SiteCapabilityMap["modules"])[];
  /** Whether the tool supports a dry-run / plan flag in its input. */
  supportsDryRun: boolean;
  /** When true, the tool requires `confirm: true` in input for execution. */
  confirmRequired: boolean;
  /** When the tool can be retried with the same idempotency key. */
  idempotent: boolean;
  /** Tags for grouping in coverage matrix and registries. */
  tags: string[];
}

/**
 * A complete tool definition: metadata + schemas + handler.
 *
 * The handler is intentionally generic; the MCP server runs zod validation
 * against `inputSchema` before invoking it, so the handler can trust its
 * `input` argument.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  metadata: ToolMetadata;
  inputSchema: z.ZodType<TInput>;
  outputSchema?: z.ZodType<TOutput>;
  handler: (ctx: ToolHandlerContext, input: TInput) => Promise<ToolResult<TOutput>>;
}

/**
 * Per-call execution context. The MCP server constructs this once per
 * incoming tool call and threads it to the handler. Handlers should
 * resolve site context, capability, and identity through the provided
 * services rather than reaching into the env directly.
 */
export interface ToolHandlerContext {
  correlationId: string;
  /** Idempotency key if the caller supplied one or one was derived. */
  idempotencyKey?: string;
  /** Resolved at startup; can be re-resolved on demand by the registry. */
  capabilityFor(appInstanceId: string): Promise<SiteCapabilityMap>;
  /** Services the handler is allowed to use. */
  services: ToolServices;
  /** Pre-validated identity assertion. */
  identity: { identity: Identity; appInstanceId?: string; accountId?: string };
}

/**
 * Service container surfaced to handlers. Each service is an interface so
 * tests can swap them with fakes.
 */
export interface ToolServices {
  contacts: import("@wix-mcp/wix-clients").ContactsClient;
  inbox: import("@wix-mcp/wix-clients").InboxClient;
  emailMarketing: import("@wix-mcp/wix-clients").EmailMarketingClient;
  ecomOrders: import("@wix-mcp/wix-clients").EcomOrdersClient;
  pricingPlans: import("@wix-mcp/wix-clients").PricingPlansClient;
  automations: import("@wix-mcp/wix-clients").AutomationsClient;
  appInstance: import("@wix-mcp/wix-clients").AppInstanceClient;
  siteContext: import("@wix-mcp/wix-clients").SiteContextResolver;
}
