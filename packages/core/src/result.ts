import type {
  BackendType,
  CapabilityStatus,
  ToolResult,
} from "@wix-mcp/shared-types";

export interface BuildResultArgs<TData> {
  ok: boolean;
  backendUsed: BackendType;
  capabilityStatus: CapabilityStatus;
  humanSummary: string;
  data: TData;
  warnings?: string[];
  nextSuggestedTools?: string[];
  correlationId: string;
  idempotencyKey?: string;
}

export function buildResult<TData>(args: BuildResultArgs<TData>): ToolResult<TData> {
  const result: ToolResult<TData> = {
    ok: args.ok,
    backendUsed: args.backendUsed,
    capabilityStatus: args.capabilityStatus,
    humanSummary: args.humanSummary,
    data: args.data,
    warnings: args.warnings ?? [],
    nextSuggestedTools: args.nextSuggestedTools ?? [],
    correlationId: args.correlationId,
  };
  if (args.idempotencyKey) result.idempotencyKey = args.idempotencyKey;
  return result;
}
