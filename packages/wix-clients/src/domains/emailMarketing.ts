import type { WixHttpClient } from "../httpClient.js";

/**
 * Wix Email Marketing API.
 * Reference: /email-marketing/v1/campaigns
 *
 * NOTE: The API does not support creating brand-new campaigns from scratch
 * via REST. New campaigns must already exist in the Wix dashboard; the API
 * supports list, get, reuse, send-test, publish (send), reschedule, stats,
 * and recipients. The MCP layer exposes the missing "create" path through
 * the dashboard automation fallback.
 */
export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "PAUSED"
  | "ARCHIVED"
  | "SENT"
  | "FAILED";

export interface Campaign {
  campaignId: string;
  title?: string;
  subject?: string;
  status?: CampaignStatus;
  publishedDate?: string;
  scheduledDate?: string;
  fromEmail?: string;
  fromName?: string;
}

export interface ListCampaignsArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  cursor?: string;
  limit?: number;
  status?: CampaignStatus;
}

export interface ListCampaignsResponse {
  campaigns: Campaign[];
  pagingMetadata?: { cursors?: { next?: string } };
}

export interface EmailMarketingClient {
  listCampaigns(args: ListCampaignsArgs): Promise<ListCampaignsResponse>;
}

export class WixEmailMarketingClient implements EmailMarketingClient {
  constructor(private readonly http: WixHttpClient) {}

  async listCampaigns(args: ListCampaignsArgs): Promise<ListCampaignsResponse> {
    const query: Record<string, string | number | undefined> = {};
    if (args.limit !== undefined) query["paging.limit"] = args.limit;
    if (args.cursor !== undefined) query["cursorPaging.cursor"] = args.cursor;
    if (args.status !== undefined) query["status"] = args.status;
    return this.http.send<ListCampaignsResponse>({
      method: "GET",
      path: "/email-marketing/v1/campaigns",
      query,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
    });
  }
}
