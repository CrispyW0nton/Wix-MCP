import type { WixHttpClient } from "../httpClient.js";

/**
 * Wix App Instance API.
 * Reference: GET /apps/v1/instance
 *
 * Returns the calling app's installation context for the current site, including
 * the appInstanceId, app permissions/scopes, and site metadata.
 */
export interface AppInstance {
  instance?: {
    instanceId: string;
    appName?: string;
    permissions?: string[];
    isFree?: boolean;
    expirationDate?: string;
  };
  site?: {
    siteId: string;
    accountId?: string;
    siteDisplayName?: string;
    locale?: string;
    multilingual?: { isMultiLingual: boolean; supportedLanguages?: string[] };
    paymentsCurrency?: string;
    timeZone?: string;
    url?: string;
  };
}

export interface AppInstanceClient {
  getAppInstance(args: { appInstanceId: string; correlationId: string }): Promise<AppInstance>;
}

export class WixAppInstanceClient implements AppInstanceClient {
  constructor(private readonly http: WixHttpClient) {}

  async getAppInstance(args: { appInstanceId: string; correlationId: string }) {
    return this.http.send<AppInstance>({
      method: "GET",
      path: "/apps/v1/instance",
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      correlationId: args.correlationId,
    });
  }
}
