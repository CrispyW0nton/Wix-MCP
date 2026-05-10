import { request } from "undici";
import {
  AuthError,
  ExternalServiceError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  ValidationError,
} from "@wix-mcp/core";
import type { Identity } from "@wix-mcp/shared-types";
import type { ApiKeyAdminProvider } from "@wix-mcp/wix-auth";
import { type WixOAuthClient } from "@wix-mcp/wix-auth";

const WIX_API_BASE = "https://www.wixapis.com";

export interface HttpClientDeps {
  oauth: WixOAuthClient;
  apiKeyAdmin: ApiKeyAdminProvider;
  /** Per-correlation logger callback. */
  onRequest?: (info: { method: string; url: string; correlationId: string }) => void;
}

export interface RequestOptions<TBody = unknown> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: TBody;
  identity: Identity;
  appInstanceId?: string;
  accountId?: string;
  siteId?: string;
  correlationId: string;
  /** Idempotency key passed through to Wix where supported. */
  idempotencyKey?: string;
  /** Timeout in ms. Defaults to 30s. */
  timeoutMs?: number;
}

/**
 * Thin Wix HTTP client that knows how to attach the right auth headers
 * for each identity type. Domain clients call this — never undici directly.
 */
export class WixHttpClient {
  constructor(private readonly deps: HttpClientDeps) {}

  async send<TResp = unknown>(opts: RequestOptions): Promise<TResp> {
    const url = this.buildUrl(opts.path, opts.query);
    const headers = await this.buildHeaders(opts);
    this.deps.onRequest?.({
      method: opts.method ?? "GET",
      url,
      correlationId: opts.correlationId,
    });

    const init: Parameters<typeof request>[1] = {
      method: opts.method ?? "GET",
      headers,
      bodyTimeout: opts.timeoutMs ?? 30_000,
      headersTimeout: opts.timeoutMs ?? 30_000,
    };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
    }
    const res = await request(url, init);
    const text = await res.body.text();
    const parsed = safeJson(text);

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return parsed as TResp;
    }

    throw mapHttpError(res.statusCode, url, parsed);
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(path.startsWith("http") ? path : `${WIX_API_BASE}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async buildHeaders(opts: RequestOptions): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      "wix-correlation-id": opts.correlationId,
    };
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

    switch (opts.identity) {
      case "wix_app": {
        if (!opts.appInstanceId) {
          throw new AuthError("wix_app calls require appInstanceId");
        }
        const token = await this.deps.oauth.getAccessTokenForInstance(opts.appInstanceId);
        headers["authorization"] = token;
        if (opts.siteId) headers["wix-site-id"] = opts.siteId;
        return headers;
      }
      case "api_key_admin": {
        const creds = this.deps.apiKeyAdmin.require();
        headers["authorization"] = creds.apiKey;
        headers["wix-account-id"] = opts.accountId ?? creds.accountId;
        if (opts.siteId) headers["wix-site-id"] = opts.siteId;
        return headers;
      }
      case "wix_user":
      case "member":
      case "visitor":
        throw new PermissionError(
          `Identity '${opts.identity}' cannot be sourced from the HTTP client. Route through the dashboard bridge or browser worker instead.`,
        );
      default: {
        const _exhaustive: never = opts.identity;
        throw new AuthError(`Unknown identity '${String(_exhaustive)}'`);
      }
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return text;
  }
}

function mapHttpError(status: number, url: string, body: unknown): Error {
  const message = extractMessage(body) ?? `Wix API ${status} at ${url}`;
  if (status === 400) return new ValidationError(message, body);
  if (status === 401) return new AuthError(message, body);
  if (status === 403) return new PermissionError(message, body);
  if (status === 404) return new NotFoundError(message, body);
  if (status === 429) return new RateLimitError(message, body);
  return new ExternalServiceError(message, status, body);
}

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b["message"] === "string") return b["message"];
  if (
    typeof b["details"] === "object" &&
    b["details"] !== null &&
    typeof (b["details"] as Record<string, unknown>)["applicationError"] === "object"
  ) {
    const ae = (b["details"] as Record<string, unknown>)["applicationError"] as Record<
      string,
      unknown
    >;
    if (typeof ae["description"] === "string") return ae["description"];
  }
  return undefined;
}
