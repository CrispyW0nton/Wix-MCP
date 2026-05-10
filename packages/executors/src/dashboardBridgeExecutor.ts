import { request } from "undici";
import { AuthError, ExternalServiceError } from "@wix-mcp/core";

export interface DashboardBridgeConfig {
  url: string;
  token: string;
  /** Default timeout in ms. */
  timeoutMs?: number;
}

/**
 * Calls the dashboard-bridge companion app, which runs inside a Wix dashboard
 * surface and forwards user-context calls.
 *
 * This is intentionally a thin RPC: the bridge defines its own JSON contract
 * keyed by `op`. Tools that need user-context invoke
 * `bridge.invoke({ op: "...", args: {...} })`.
 */
export class DashboardBridgeExecutor {
  constructor(private readonly cfg: DashboardBridgeConfig) {
    if (!cfg.token) {
      throw new AuthError("Dashboard bridge token is required.");
    }
  }

  async invoke<TResp = unknown>(args: {
    op: string;
    args: Record<string, unknown>;
    correlationId: string;
  }): Promise<TResp> {
    const res = await request(`${this.cfg.url}/bridge/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bridge-token": this.cfg.token,
        "x-correlation-id": args.correlationId,
      },
      body: JSON.stringify({ op: args.op, args: args.args }),
      bodyTimeout: this.cfg.timeoutMs ?? 30_000,
      headersTimeout: this.cfg.timeoutMs ?? 30_000,
    });
    const text = await res.body.text();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new ExternalServiceError(
        `Dashboard bridge ${res.statusCode} for op '${args.op}'`,
        res.statusCode,
        safeJson(text),
      );
    }
    return safeJson(text) as TResp;
  }
}

function safeJson(t: string): unknown {
  try {
    return t ? JSON.parse(t) : undefined;
  } catch {
    return t;
  }
}
