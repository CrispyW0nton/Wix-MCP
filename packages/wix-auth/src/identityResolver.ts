import type { Identity, IdentityAssertion } from "@wix-mcp/shared-types";
import { AuthError, PermissionError } from "@wix-mcp/core";
import type { WixOAuthClient } from "./oauth.js";
import type { ApiKeyAdminProvider } from "./apiKeyAdmin.js";

export interface IdentityResolverOptions {
  oauth: WixOAuthClient;
  apiKeyAdmin: ApiKeyAdminProvider;
  /**
   * Optional dashboard-bridge token presence indicates wix_user identity is
   * available. We never resolve a real wix_user token here — the bridge runs
   * inside the dashboard and forwards the user's session.
   */
  dashboardBridgeAvailable: boolean;
}

export interface ResolveIdentityArgs {
  required: Identity;
  appInstanceId?: string;
}

/**
 * Resolves an identity for a tool call. The resolver does NOT auto-elevate.
 * If the tool requires `wix_user` and only `wix_app` is available, this fails
 * with a clear error so the tool layer can either (a) reroute through the
 * dashboard bridge or (b) suggest the user open the dashboard companion.
 */
export class IdentityResolver {
  constructor(private readonly opts: IdentityResolverOptions) {}

  async resolve(args: ResolveIdentityArgs): Promise<IdentityAssertion> {
    switch (args.required) {
      case "wix_app": {
        if (!args.appInstanceId) {
          throw new AuthError(
            "wix_app identity requires an appInstanceId. Resolve siteContext first.",
          );
        }
        const token = await this.opts.oauth.getAccessTokenForInstance(args.appInstanceId);
        return {
          identity: "wix_app",
          scopes: [],
          scopeLevel: "site",
          appInstanceId: args.appInstanceId,
          // We don't know expiresAt without re-reading the store; the OAuth
          // client refreshes proactively, so anything > now+30s is fine here.
          expiresAt: Date.now() + 30_000,
          // Embed the token in scopes? No: tokens are passed via the HTTP
          // client wrapper directly. The assertion only proves identity.
          ...(token ? {} : {}),
        };
      }
      case "api_key_admin": {
        const creds = this.opts.apiKeyAdmin.require();
        return {
          identity: "api_key_admin",
          scopes: ["account.admin"],
          scopeLevel: "account",
          accountId: creds.accountId,
        };
      }
      case "wix_user": {
        if (!this.opts.dashboardBridgeAvailable) {
          throw new PermissionError(
            "wix_user identity is only available via the dashboard bridge. Enable FEATURE_DASHBOARD_BRIDGE and install the bridge in the Wix dashboard.",
          );
        }
        return {
          identity: "wix_user",
          scopes: ["dashboard.user"],
          scopeLevel: "site",
        };
      }
      case "member":
      case "visitor":
        throw new PermissionError(
          `Identity '${args.required}' is not addressable from the MCP control plane.`,
        );
      default: {
        const _exhaustive: never = args.required;
        throw new AuthError(`Unknown identity '${String(_exhaustive)}'.`);
      }
    }
  }
}
