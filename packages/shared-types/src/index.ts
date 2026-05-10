/**
 * Shared types used across the Wix MCP control plane.
 *
 * No runtime imports here. Pure structural types only — runtime concerns
 * (zod, errors, logger, http) live in their own packages so this stays
 * the lowest-level dependency.
 */

export type Identity =
  | "wix_app"
  | "api_key_admin"
  | "wix_user"
  | "member"
  | "visitor";

export type BackendType = "api" | "dashboard_bridge" | "browser_automation";

export type RiskLevel = "read" | "low" | "medium" | "high";

export type CapabilityStatus =
  | "supported"
  | "partial"
  | "unsupported"
  | "unknown";

export type ScopeLevel = "site" | "account";

/**
 * Site context. Tools accept any of these and the resolver normalizes them.
 */
export interface SiteContextInput {
  siteId?: string;
  domain?: string;
  appInstanceId?: string;
}

export interface ResolvedSiteContext {
  siteId: string;
  appInstanceId: string;
  /** Display label for audit + UI surfaces; never use as a key. */
  label: string;
  /** Account that owns the site, when known. */
  accountId?: string;
  /** Primary connected domain, when known. */
  domain?: string;
}

/**
 * The structured envelope every MCP tool returns to Cursor.
 *
 * Cursor surfaces `humanSummary` first, agent code reads `data`.
 */
export interface ToolResult<TData = unknown> {
  ok: boolean;
  backendUsed: BackendType;
  capabilityStatus: CapabilityStatus;
  humanSummary: string;
  data: TData;
  warnings: string[];
  nextSuggestedTools: string[];
  /** Correlation id used in logs / audit / nested calls. */
  correlationId: string;
  /** Echoed for clients that retry on the same intent. */
  idempotencyKey?: string;
}

/**
 * Capability map for a single site, populated by the registry at startup
 * and refreshed on demand.
 */
export interface SiteCapabilityMap {
  siteId: string;
  appInstanceId: string;
  fetchedAt: string;
  modules: {
    stores: CapabilityStatus;
    bookings: CapabilityStatus;
    pricingPlans: CapabilityStatus;
    events: CapabilityStatus;
    members: CapabilityStatus;
    cms: CapabilityStatus;
    media: CapabilityStatus;
    emailMarketing: CapabilityStatus;
    inbox: CapabilityStatus;
    automations: CapabilityStatus;
    domains: CapabilityStatus;
    seo: CapabilityStatus;
  };
  /** Inbox channels actually available for this site (chat, sms, fb, etc). */
  inboxChannels: string[];
  /** Email marketing sender info presence. */
  emailMarketing: {
    hasVerifiedSender: boolean;
    accountActive: boolean;
  };
  /** Per-tool override map: forces a tool to a different capability/backend. */
  toolOverrides: Record<
    string,
    { capability: CapabilityStatus; backend: BackendType }
  >;
}

/**
 * Identity assertion provided by the auth layer at execution time.
 */
export interface IdentityAssertion {
  identity: Identity;
  scopes: string[];
  scopeLevel: ScopeLevel;
  /** App instance identity, when applicable. */
  appInstanceId?: string;
  /** Wix user id, when present (dashboard bridge / OAuth user flow). */
  wixUserId?: string;
  /** Account id, when present. */
  accountId?: string;
  /** Token expiry epoch ms. */
  expiresAt?: number;
}

/**
 * Audit record persisted for every mutation and every fallback execution.
 */
export interface AuditRecord {
  ts: string;
  correlationId: string;
  toolName: string;
  backendUsed: BackendType;
  capabilityStatus: CapabilityStatus;
  identity: Identity;
  siteId?: string;
  accountId?: string;
  appInstanceId?: string;
  riskLevel: RiskLevel;
  ok: boolean;
  durationMs: number;
  inputRedacted: unknown;
  resultSummary: string;
  warnings: string[];
  idempotencyKey?: string;
  /** Reference to a screenshot/video bundle for browser automation jobs. */
  artifactRef?: string;
  errorCode?: string;
  errorMessage?: string;
}
