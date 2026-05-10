import pino from "pino";

export type Logger = pino.Logger;

let rootLogger: Logger | undefined;

export interface LoggerOptions {
  level?: string;
  /**
   * MCP servers must NOT write logs to stdout (stdout is reserved for the
   * MCP protocol). Default destination is stderr (fd=2). Override only
   * for non-MCP processes (backend, dashboard bridge, browser worker).
   */
  destinationFd?: number;
  /** Stable component name added as `service` to every log line. */
  service?: string;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? process.env["MCP_LOG_LEVEL"] ?? "info";
  const fd = options.destinationFd ?? 2;
  const base: Record<string, unknown> = {};
  if (options.service) base["service"] = options.service;
  return pino(
    {
      level,
      base,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    pino.destination({ fd, sync: false }),
  );
}

export function getLogger(): Logger {
  if (!rootLogger) {
    rootLogger = createLogger({ service: "wix-mcp" });
  }
  return rootLogger;
}

export function withCorrelation(logger: Logger, correlationId: string): Logger {
  return logger.child({ correlationId });
}
