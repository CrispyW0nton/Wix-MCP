import type { WixHttpClient } from "../httpClient.js";

/**
 * Wix Contacts API (CRM).
 * Reference: /contacts/v4/contacts
 */
export interface ContactName {
  first?: string;
  last?: string;
}

export interface ContactEmail {
  tag?: string;
  email: string;
  primary?: boolean;
}

export interface ContactPhone {
  tag?: string;
  phone: string;
  primary?: boolean;
}

export interface Contact {
  id?: string;
  revision?: number;
  info?: {
    name?: ContactName;
    emails?: { items?: ContactEmail[] };
    phones?: { items?: ContactPhone[] };
    labelKeys?: { items?: string[] };
    extendedFields?: { items?: Record<string, unknown> };
    company?: string;
    jobTitle?: string;
  };
  primaryInfo?: { email?: string; phone?: string };
}

export interface ListContactsResponse {
  contacts: Contact[];
  pagingMetadata?: {
    count?: number;
    offset?: number;
    total?: number;
    cursors?: { next?: string; prev?: string };
  };
}

export interface ListContactsArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  cursor?: string;
  limit?: number;
  query?: string;
}

export interface CreateContactArgs {
  appInstanceId: string;
  siteId?: string;
  correlationId: string;
  idempotencyKey?: string;
  info: NonNullable<Contact["info"]>;
}

export interface ContactsClient {
  list(args: ListContactsArgs): Promise<ListContactsResponse>;
  create(args: CreateContactArgs): Promise<{ contact: Contact }>;
}

export class WixContactsClient implements ContactsClient {
  constructor(private readonly http: WixHttpClient) {}

  async list(args: ListContactsArgs): Promise<ListContactsResponse> {
    const query: Record<string, string | number | undefined> = {};
    if (args.limit !== undefined) query["paging.limit"] = args.limit;
    if (args.cursor !== undefined) query["cursorPaging.cursor"] = args.cursor;
    if (args.query !== undefined) query["query.search"] = args.query;
    return this.http.send<ListContactsResponse>({
      method: "GET",
      path: "/contacts/v4/contacts",
      query,
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
    });
  }

  async create(args: CreateContactArgs): Promise<{ contact: Contact }> {
    return this.http.send<{ contact: Contact }>({
      method: "POST",
      path: "/contacts/v4/contacts",
      identity: "wix_app",
      appInstanceId: args.appInstanceId,
      ...(args.siteId !== undefined ? { siteId: args.siteId } : {}),
      correlationId: args.correlationId,
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      body: { info: args.info },
    });
  }
}
