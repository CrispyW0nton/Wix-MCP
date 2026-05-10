import type { Identity } from "@wix-mcp/shared-types";

/**
 * One row in the token store. The combination of (identity, appInstanceId, accountId)
 * is unique. We persist refresh tokens for app instances; we never persist user
 * passwords.
 */
export interface AccessTokenRecord {
  identity: Identity;
  appInstanceId?: string;
  accountId?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scopes: string[];
}

export interface AppCredentials {
  appId: string;
  appSecret: string;
}

export interface OAuthCallbackParams {
  code: string;
  state: string;
  instanceId: string;
}
