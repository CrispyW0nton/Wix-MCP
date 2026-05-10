import type { WixHttpClient } from "../httpClient.js";

/**
 * Wix Inbox API (multi-channel: Wix Chat, SMS, FB business, etc).
 * Reference: /inbox/v3/conversations, /inbox/v2/messages/send
 *
 * Per Wix docs, the available channels for a given site are determined
 * by per-site configuration (channel installation, phone provisioning, etc).
 * The capability registry probes this; do not assume SMS is always available.
 */
export type InboxChannel =
  | "WIX_CHAT"
  | "SMS"
  | "FACEBOOK"
  | "INSTAGRAM"
  | "EMAIL"
  | "OTHER";

export interface InboxConversation {
  id: string;
  contactId?: string;
  channel?: InboxChannel;
  lastMessage?: {
    id: string;
    direction?: "INBOUND" | "OUTBOUND";
    text?: string;
    createdDate?: string;
  };
  unreadCount?: number;
  archived?: boolean;
}

export interface ListConversationsResponse {
  conversations: InboxConversation[];
  pagingMetadata?: { count?: number; cursors?: { next?: string } };
}

export interface ListConversationsArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  cursor?: string;
  limit?: number;
}

export interface SendMessageArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  idempotencyKey?: string;
  conversationId: string;
  /** Channel hint; when omitted Wix uses the conversation's primary channel. */
  channel?: InboxChannel;
  message: { text: string } | { html: string };
}

export interface SendMessageResponse {
  message: {
    id: string;
    conversationId: string;
    direction: "OUTBOUND";
    createdDate?: string;
  };
}

export interface InboxClient {
  listConversations(args: ListConversationsArgs): Promise<ListConversationsResponse>;
  sendMessage(args: SendMessageArgs): Promise<SendMessageResponse>;
}

export class WixInboxClient implements InboxClient {
  constructor(private readonly http: WixHttpClient) {}

  async listConversations(args: ListConversationsArgs) {
    const query: Record<string, string | number | undefined> = {};
    if (args.limit !== undefined) query["paging.limit"] = args.limit;
    if (args.cursor !== undefined) query["cursorPaging.cursor"] = args.cursor;
    return this.http.send<ListConversationsResponse>({
      method: "GET",
      path: "/inbox/v3/conversations",
      query,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
    });
  }

  async sendMessage(args: SendMessageArgs) {
    return this.http.send<SendMessageResponse>({
      method: "POST",
      path: "/inbox/v2/messages/send",
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      body: {
        conversationId: args.conversationId,
        ...(args.channel !== undefined ? { channel: args.channel } : {}),
        message: args.message,
      },
    });
  }
}
