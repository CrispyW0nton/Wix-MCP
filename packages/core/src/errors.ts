/**
 * Common error model used across executors and tools.
 *
 * Every error carries a stable `code` so the MCP layer can map them
 * to user-facing diagnostics without leaking provider internals.
 */

export type ErrorCode =
  | "AUTH_ERROR"
  | "PERMISSION_ERROR"
  | "CAPABILITY_ERROR"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT_ERROR"
  | "AUTOMATION_FALLBACK_REQUIRED"
  | "EXTERNAL_SERVICE_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED_OPERATION"
  | "INTERNAL_ERROR";

export class WixMcpError extends Error {
  public readonly code: ErrorCode;
  public readonly status?: number;
  public readonly details?: unknown;
  public override readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options: { status?: number; details?: unknown; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "WixMcpError";
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export class AuthError extends WixMcpError {
  constructor(message: string, details?: unknown) {
    super("AUTH_ERROR", message, { status: 401, details });
  }
}

export class PermissionError extends WixMcpError {
  constructor(message: string, details?: unknown) {
    super("PERMISSION_ERROR", message, { status: 403, details });
  }
}

export class CapabilityError extends WixMcpError {
  constructor(message: string, details?: unknown) {
    super("CAPABILITY_ERROR", message, { status: 412, details });
  }
}

export class ValidationError extends WixMcpError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, { status: 400, details });
  }
}

export class RateLimitError extends WixMcpError {
  constructor(message: string, details?: unknown) {
    super("RATE_LIMIT_ERROR", message, { status: 429, details });
  }
}

export class AutomationFallbackRequiredError extends WixMcpError {
  constructor(message: string, details?: unknown) {
    super("AUTOMATION_FALLBACK_REQUIRED", message, { status: 501, details });
  }
}

export class ExternalServiceError extends WixMcpError {
  constructor(message: string, status?: number, details?: unknown) {
    const opts: { status?: number; details?: unknown } = {};
    if (status !== undefined) opts.status = status;
    if (details !== undefined) opts.details = details;
    super("EXTERNAL_SERVICE_ERROR", message, opts);
  }
}

export class NotFoundError extends WixMcpError {
  constructor(message: string, details?: unknown) {
    super("NOT_FOUND", message, { status: 404, details });
  }
}

export class UnsupportedOperationError extends WixMcpError {
  constructor(message: string, details?: unknown) {
    super("UNSUPPORTED_OPERATION", message, { status: 501, details });
  }
}

export function isWixMcpError(err: unknown): err is WixMcpError {
  return err instanceof WixMcpError;
}

export function toWixMcpError(err: unknown): WixMcpError {
  if (isWixMcpError(err)) return err;
  if (err instanceof Error) {
    return new WixMcpError("INTERNAL_ERROR", err.message, { cause: err });
  }
  return new WixMcpError("INTERNAL_ERROR", "Unknown error", { details: err });
}
