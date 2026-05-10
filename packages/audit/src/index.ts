import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { redact } from "@wix-mcp/core";
import type { AuditRecord } from "@wix-mcp/shared-types";

export interface AuditSink {
  emit(record: AuditRecord): Promise<void>;
}

export class FileAuditSink implements AuditSink {
  private ensured = false;

  constructor(private readonly path: string) {}

  async emit(record: AuditRecord): Promise<void> {
    if (!this.ensured) {
      await mkdir(dirname(this.path), { recursive: true });
      this.ensured = true;
    }
    const safe: AuditRecord = {
      ...record,
      inputRedacted: redact(record.inputRedacted),
    };
    await appendFile(this.path, JSON.stringify(safe) + "\n", "utf8");
  }
}

export class NoopAuditSink implements AuditSink {
  async emit(_record: AuditRecord): Promise<void> {}
}

export class CompositeAuditSink implements AuditSink {
  constructor(private readonly sinks: AuditSink[]) {}
  async emit(record: AuditRecord): Promise<void> {
    await Promise.allSettled(this.sinks.map((s) => s.emit(record)));
  }
}

/**
 * Convenience builder so callers don't recompute timestamps/redaction.
 */
export interface PartialAuditInput {
  toolName: string;
  backendUsed: AuditRecord["backendUsed"];
  capabilityStatus: AuditRecord["capabilityStatus"];
  identity: AuditRecord["identity"];
  riskLevel: AuditRecord["riskLevel"];
  ok: boolean;
  startedAt: number;
  correlationId: string;
  input: unknown;
  resultSummary: string;
  warnings?: string[];
  siteId?: string;
  accountId?: string;
  appInstanceId?: string;
  idempotencyKey?: string;
  artifactRef?: string;
  errorCode?: string;
  errorMessage?: string;
}

export function buildAuditRecord(input: PartialAuditInput): AuditRecord {
  const record: AuditRecord = {
    ts: new Date().toISOString(),
    correlationId: input.correlationId,
    toolName: input.toolName,
    backendUsed: input.backendUsed,
    capabilityStatus: input.capabilityStatus,
    identity: input.identity,
    riskLevel: input.riskLevel,
    ok: input.ok,
    durationMs: Math.max(0, Date.now() - input.startedAt),
    inputRedacted: redact(input.input),
    resultSummary: input.resultSummary,
    warnings: input.warnings ?? [],
  };
  if (input.siteId !== undefined) record.siteId = input.siteId;
  if (input.accountId !== undefined) record.accountId = input.accountId;
  if (input.appInstanceId !== undefined) record.appInstanceId = input.appInstanceId;
  if (input.idempotencyKey !== undefined) record.idempotencyKey = input.idempotencyKey;
  if (input.artifactRef !== undefined) record.artifactRef = input.artifactRef;
  if (input.errorCode !== undefined) record.errorCode = input.errorCode;
  if (input.errorMessage !== undefined) record.errorMessage = input.errorMessage;
  return record;
}
