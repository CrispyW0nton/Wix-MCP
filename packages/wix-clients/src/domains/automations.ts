import type { WixHttpClient } from "../httpClient.js";

/**
 * Wix Automations V2 + Custom Trigger.
 * Reference: /automations/v2/automations, /automations/v2/triggers/run
 */
export interface Automation {
  id: string;
  name?: string;
  enabled?: boolean;
  triggerInfo?: { triggerKey?: string };
  actions?: { items?: unknown[] };
}

export interface ListAutomationsResponse {
  automations: Automation[];
  pagingMetadata?: { cursors?: { next?: string } };
}

export interface AutomationsClient {
  list(args: {
    appInstanceId: string;
    siteId?: string;
    correlationId: string;
    cursor?: string;
    limit?: number;
  }): Promise<ListAutomationsResponse>;
}

export class WixAutomationsClient implements AutomationsClient {
  constructor(private readonly http: WixHttpClient) {}

  async list(args: {
    appInstanceId: string;
    siteId?: string;
    correlationId: string;
    cursor?: string;
    limit?: number;
  }) {
    const query: Record<string, string | number | undefined> = {};
    if (args.limit !== undefined) query["paging.limit"] = args.limit;
    if (args.cursor !== undefined) query["cursorPaging.cursor"] = args.cursor;
    return this.http.send<ListAutomationsResponse>({
      method: "GET",
      path: "/automations/v2/automations",
      query,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
    });
  }
}
