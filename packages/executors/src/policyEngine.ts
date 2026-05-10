import {
  CapabilityError,
  PermissionError,
  ValidationError,
} from "@wix-mcp/core";
import type {
  BackendType,
  IdentityAssertion,
  SiteCapabilityMap,
} from "@wix-mcp/shared-types";
import { evaluateToolCapability } from "@wix-mcp/capability-registry";
import type { ToolMetadata } from "@wix-mcp/tool-definitions";

export interface PolicyDecision {
  /** Backend the router should use. */
  backend: BackendType;
  /** Capability status for the (tool, site) pair. */
  capabilityStatus: "supported" | "partial" | "unsupported" | "unknown";
  /** Warnings the result envelope should surface. */
  warnings: string[];
}

export interface FeatureFlags {
  dashboardBridgeEnabled: boolean;
  browserAutomationEnabled: boolean;
  destructiveWritesEnabled: boolean;
}

export interface PolicyInput {
  metadata: ToolMetadata;
  capabilityMap: SiteCapabilityMap | undefined;
  identity: IdentityAssertion;
  flags: FeatureFlags;
  /** True if the tool input contains `confirm: true`. */
  hasConfirm: boolean;
  /** True if the tool input contains `dryRun: true`. */
  isDryRun: boolean;
}

/**
 * Identity-aware policy gate. Run before any executor; throws on rejection
 * so the calling tool layer never executes a forbidden call by accident.
 */
export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const { metadata, capabilityMap, identity, flags, hasConfirm, isDryRun } = input;

  if (metadata.requiredIdentity !== identity.identity) {
    throw new PermissionError(
      `Tool '${metadata.name}' requires identity '${metadata.requiredIdentity}' but resolved '${identity.identity}'.`,
    );
  }

  if (
    metadata.riskLevel === "high" &&
    !flags.destructiveWritesEnabled &&
    !isDryRun
  ) {
    throw new PermissionError(
      `Tool '${metadata.name}' is high-risk and FEATURE_DESTRUCTIVE_WRITES is disabled. Either enable the flag or pass dryRun: true.`,
    );
  }

  if (metadata.confirmRequired && !hasConfirm && !isDryRun) {
    throw new ValidationError(
      `Tool '${metadata.name}' requires explicit { confirm: true } to execute.`,
    );
  }

  const capabilityStatus = capabilityMap
    ? evaluateToolCapability(capabilityMap, metadata.requiredModules)
    : "unknown";

  if (capabilityStatus === "unsupported") {
    throw new CapabilityError(
      `Tool '${metadata.name}' requires modules [${metadata.requiredModules.join(", ")}] which are not enabled on this site.`,
    );
  }

  const warnings: string[] = [];
  if (capabilityStatus === "unknown") {
    warnings.push(
      `Capability for '${metadata.name}' could not be confirmed; proceeding optimistically.`,
    );
  }
  if (capabilityStatus === "partial") {
    warnings.push(
      `Tool '${metadata.name}' has only partial capability support on this site; some features may degrade.`,
    );
  }

  // Pick backend in declared preference order, gated by flags.
  let backend: BackendType | undefined;
  for (const candidate of metadata.backends) {
    if (candidate === "api") {
      backend = "api";
      break;
    }
    if (candidate === "dashboard_bridge" && flags.dashboardBridgeEnabled) {
      backend = "dashboard_bridge";
      break;
    }
    if (candidate === "browser_automation" && flags.browserAutomationEnabled) {
      backend = "browser_automation";
      break;
    }
  }
  if (!backend) {
    throw new CapabilityError(
      `Tool '${metadata.name}' has no enabled backend. Allowed: [${metadata.backends.join(", ")}].`,
    );
  }

  return { backend, capabilityStatus, warnings };
}
