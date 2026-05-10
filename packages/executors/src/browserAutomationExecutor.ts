import { request } from "undici";
import { AuthError, ExternalServiceError } from "@wix-mcp/core";

export interface BrowserAutomationConfig {
  url: string;
  token: string;
  enabled: boolean;
  timeoutMs?: number;
}

export interface BrowserJobInput {
  workflow: string;
  args: Record<string, unknown>;
  correlationId: string;
  /** When true, browser worker stops after capturing a snapshot. */
  dryRun?: boolean;
}

export interface BrowserJobResult<TData = unknown> {
  ok: boolean;
  workflow: string;
  data: TData;
  steps: { name: string; status: "ok" | "error"; durationMs: number; note?: string }[];
  artifacts: { screenshots: string[]; trace?: string };
  errorMessage?: string;
}

/**
 * Calls the Playwright fallback worker. Requires explicit feature-flag opt-in.
 * Tools that route here must surface the artifact ref in their result so the
 * agent can ask for screenshots when something looks off.
 */
export class BrowserAutomationExecutor {
  constructor(private readonly cfg: BrowserAutomationConfig) {
    if (cfg.enabled && !cfg.token) {
      throw new AuthError("Browser automation token is required when enabled.");
    }
  }

  isEnabled(): boolean {
    return this.cfg.enabled;
  }

  async run<TData = unknown>(input: BrowserJobInput): Promise<BrowserJobResult<TData>> {
    if (!this.cfg.enabled) {
      throw new AuthError("Browser automation is disabled. Set FEATURE_BROWSER_AUTOMATION=true.");
    }
    const res = await request(`${this.cfg.url}/jobs/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-token": this.cfg.token,
        "x-correlation-id": input.correlationId,
      },
      body: JSON.stringify(input),
      bodyTimeout: this.cfg.timeoutMs ?? 120_000,
      headersTimeout: this.cfg.timeoutMs ?? 120_000,
    });
    const text = await res.body.text();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new ExternalServiceError(
        `Browser worker ${res.statusCode} for workflow '${input.workflow}'`,
        res.statusCode,
        safeJson(text),
      );
    }
    return safeJson(text) as BrowserJobResult<TData>;
  }
}

function safeJson(t: string): unknown {
  try {
    return t ? JSON.parse(t) : undefined;
  } catch {
    return t;
  }
}
