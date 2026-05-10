import {
  buildAuditRecord,
  type AuditSink,
} from "@wix-mcp/audit";
import { CapabilityRegistry } from "@wix-mcp/capability-registry";
import {
  newCorrelationId,
  newIdempotencyKey,
  toWixMcpError,
  WixMcpError,
} from "@wix-mcp/core";
import type {
  IdentityAssertion,
  ToolResult,
} from "@wix-mcp/shared-types";
import type {
  ToolDefinition,
  ToolHandlerContext,
  ToolServices,
} from "@wix-mcp/tool-definitions";
import type { IdentityResolver } from "@wix-mcp/wix-auth";
import { evaluatePolicy, type FeatureFlags } from "./policyEngine.js";

export interface HybridRouterDeps {
  identityResolver: IdentityResolver;
  capabilityRegistry: CapabilityRegistry;
  services: ToolServices;
  audit: AuditSink;
  flags: FeatureFlags;
}

/**
 * The HybridRouter is the single entry point for executing any tool.
 *
 * Pipeline:
 *  1. Validate input via the tool's zod schema.
 *  2. Resolve identity (wix_app | api_key_admin | wix_user).
 *  3. Resolve site context (if input has SiteContext).
 *  4. Load capability map for the site.
 *  5. Evaluate policy → pick backend.
 *  6. Invoke handler with a fully-constructed context.
 *  7. Emit an audit record (success or failure).
 */
export class HybridRouter {
  constructor(private readonly deps: HybridRouterDeps) {}

  async execute<TInput, TOutput>(
    tool: ToolDefinition<TInput, TOutput>,
    rawInput: unknown,
  ): Promise<ToolResult<TOutput>> {
    const startedAt = Date.now();
    const correlationId = newCorrelationId();
    let identity: IdentityAssertion | undefined;
    let parsed: TInput | undefined;
    try {
      parsed = tool.inputSchema.parse(rawInput);

      const inputAny = parsed as unknown as Record<string, unknown>;
      const ctxInput =
        (inputAny["site"] as { appInstanceId?: string; siteId?: string }) ??
        (inputAny as { appInstanceId?: string; siteId?: string });

      identity = await this.deps.identityResolver.resolve({
        required: tool.metadata.requiredIdentity,
        ...(ctxInput.appInstanceId !== undefined
          ? { appInstanceId: ctxInput.appInstanceId }
          : {}),
      });

      let capabilityMap;
      if (identity.appInstanceId) {
        capabilityMap = await this.deps.capabilityRegistry.getForAppInstance(
          identity.appInstanceId,
          correlationId,
        );
      }

      const decision = evaluatePolicy({
        metadata: tool.metadata,
        capabilityMap,
        identity,
        flags: this.deps.flags,
        hasConfirm: Boolean(inputAny["confirm"] === true),
        isDryRun: Boolean(inputAny["dryRun"] === true),
      });

      const idempotencyKey =
        typeof inputAny["idempotencyKey"] === "string"
          ? (inputAny["idempotencyKey"] as string)
          : tool.metadata.idempotent
            ? newIdempotencyKey()
            : undefined;

      const handlerCtx: ToolHandlerContext = {
        correlationId,
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
        capabilityFor: (id) =>
          this.deps.capabilityRegistry.getForAppInstance(id, correlationId),
        services: this.deps.services,
        identity: {
          identity: identity.identity,
          ...(identity.appInstanceId !== undefined
            ? { appInstanceId: identity.appInstanceId }
            : {}),
          ...(identity.accountId !== undefined ? { accountId: identity.accountId } : {}),
        },
      };

      const result = await tool.handler(handlerCtx, parsed);

      // Merge router-level warnings (capability) with handler warnings.
      result.warnings = [...decision.warnings, ...result.warnings];
      result.backendUsed = result.backendUsed || decision.backend;
      if (idempotencyKey && !result.idempotencyKey) {
        result.idempotencyKey = idempotencyKey;
      }

      await this.deps.audit.emit(
        buildAuditRecord({
          toolName: tool.metadata.name,
          backendUsed: result.backendUsed,
          capabilityStatus: result.capabilityStatus,
          identity: identity.identity,
          riskLevel: tool.metadata.riskLevel,
          ok: result.ok,
          startedAt,
          correlationId,
          input: parsed,
          resultSummary: result.humanSummary,
          warnings: result.warnings,
          ...(identity.appInstanceId !== undefined
            ? { appInstanceId: identity.appInstanceId }
            : {}),
          ...(identity.accountId !== undefined ? { accountId: identity.accountId } : {}),
          ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
        }),
      );
      return result;
    } catch (err) {
      const wixErr: WixMcpError = toWixMcpError(err);
      await this.deps.audit
        .emit(
          buildAuditRecord({
            toolName: tool.metadata.name,
            backendUsed: "api",
            capabilityStatus: "unknown",
            identity: identity?.identity ?? tool.metadata.requiredIdentity,
            riskLevel: tool.metadata.riskLevel,
            ok: false,
            startedAt,
            correlationId,
            input: parsed ?? rawInput,
            resultSummary: wixErr.message,
            errorCode: wixErr.code,
            errorMessage: wixErr.message,
          }),
        )
        .catch(() => {
          /* audit best-effort */
        });
      throw wixErr;
    }
  }
}
