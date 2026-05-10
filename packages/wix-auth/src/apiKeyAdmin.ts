import { AuthError } from "@wix-mcp/core";

/**
 * Admin API-key identity. This is the simplest auth flow: an account-level
 * API key passed via `Authorization: Bearer <key>` plus `wix-account-id`
 * and (optionally) `wix-site-id` headers.
 *
 * Use this only for tools that declare `requiredIdentity = "api_key_admin"`.
 */
export interface ApiKeyAdminCreds {
  apiKey: string;
  accountId: string;
}

export class ApiKeyAdminProvider {
  constructor(private readonly creds: ApiKeyAdminCreds | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.creds?.apiKey && this.creds.accountId);
  }

  require(): ApiKeyAdminCreds {
    if (!this.creds?.apiKey || !this.creds.accountId) {
      throw new AuthError(
        "API-key admin identity not configured. Set WIX_API_KEY and WIX_ACCOUNT_ID.",
      );
    }
    return this.creds;
  }
}
