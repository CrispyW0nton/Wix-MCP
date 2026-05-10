import { request } from "undici";
import { AuthError, ExternalServiceError } from "@wix-mcp/core";
import type { TokenStore } from "./tokenStore.js";
import { tokenStoreKey } from "./tokenStore.js";
import type { AccessTokenRecord, AppCredentials } from "./types.js";

/**
 * Wix OAuth client. Uses the documented Wix app OAuth flow:
 *   - Authorization URL: https://www.wix.com/installer/install
 *   - Token endpoint:    https://www.wix.com/oauth/access
 *   - Refresh endpoint:  https://www.wix.com/oauth/access (grant_type=refresh_token)
 *
 * The exact endpoint paths used by your Wix app may differ — keep them
 * configurable. We default to the values most common in Wix App docs at
 * the time of writing.
 */
const TOKEN_ENDPOINT = "https://www.wix.com/oauth/access";

export interface WixOAuthClientOptions {
  credentials: AppCredentials;
  tokenStore: TokenStore;
  endpoint?: string;
  /** Refresh tokens this many seconds before expiry. */
  earlyRefreshSeconds?: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  instance_id?: string;
  scope?: string;
}

export class WixOAuthClient {
  private readonly endpoint: string;
  private readonly earlyRefreshMs: number;

  constructor(private readonly opts: WixOAuthClientOptions) {
    this.endpoint = opts.endpoint ?? TOKEN_ENDPOINT;
    this.earlyRefreshMs = (opts.earlyRefreshSeconds ?? 60) * 1000;
  }

  /**
   * Exchange the OAuth `code` for access + refresh tokens, then persist them
   * keyed by `instanceId`.
   */
  async exchangeCode(args: {
    code: string;
    instanceId: string;
  }): Promise<AccessTokenRecord> {
    const body = {
      grant_type: "authorization_code",
      client_id: this.opts.credentials.appId,
      client_secret: this.opts.credentials.appSecret,
      code: args.code,
    };
    const tokens = await this.postToken(body);
    const record = this.buildRecord(tokens, { appInstanceId: args.instanceId });
    await this.opts.tokenStore.set(
      tokenStoreKey({ identity: "wix_app", appInstanceId: args.instanceId }),
      record,
    );
    return record;
  }

  /**
   * Returns a valid access token for the given app instance, refreshing
   * if it's expired or near-expiry.
   */
  async getAccessTokenForInstance(appInstanceId: string): Promise<string> {
    const key = tokenStoreKey({ identity: "wix_app", appInstanceId });
    const existing = await this.opts.tokenStore.get(key);
    if (!existing) {
      throw new AuthError(
        `No access token cached for app instance ${appInstanceId}. Complete OAuth install first.`,
      );
    }
    if (Date.now() < existing.expiresAt - this.earlyRefreshMs) {
      return existing.accessToken;
    }
    if (!existing.refreshToken) {
      throw new AuthError(
        `Access token expired for app instance ${appInstanceId} and no refresh token is available.`,
      );
    }
    const refreshed = await this.refresh(existing.refreshToken);
    const record = this.buildRecord(refreshed, { appInstanceId });
    if (!record.refreshToken && existing.refreshToken) {
      record.refreshToken = existing.refreshToken;
    }
    await this.opts.tokenStore.set(key, record);
    return record.accessToken;
  }

  private async refresh(refreshToken: string) {
    return this.postToken({
      grant_type: "refresh_token",
      client_id: this.opts.credentials.appId,
      client_secret: this.opts.credentials.appSecret,
      refresh_token: refreshToken,
    });
  }

  private async postToken(body: Record<string, string>): Promise<TokenResponse> {
    const res = await request(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.body.text();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new ExternalServiceError(
        `Wix OAuth token endpoint returned ${res.statusCode}`,
        res.statusCode,
        safeJson(text),
      );
    }
    const parsed = safeJson(text);
    if (!parsed || typeof parsed !== "object" || !("access_token" in parsed)) {
      throw new ExternalServiceError("Wix OAuth response missing access_token", 502, parsed);
    }
    return parsed as TokenResponse;
  }

  private buildRecord(
    res: TokenResponse,
    ctx: { appInstanceId: string },
  ): AccessTokenRecord {
    const expiresInSec = res.expires_in ?? 3600;
    const record: AccessTokenRecord = {
      identity: "wix_app",
      appInstanceId: ctx.appInstanceId,
      accessToken: res.access_token,
      expiresAt: Date.now() + expiresInSec * 1000,
      scopes: res.scope ? res.scope.split(/[\s,]+/).filter(Boolean) : [],
    };
    if (res.refresh_token) record.refreshToken = res.refresh_token;
    return record;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
