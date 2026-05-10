import { randomUUID, randomBytes } from "node:crypto";

export function newCorrelationId(): string {
  return `cor_${randomUUID()}`;
}

export function newIdempotencyKey(): string {
  return `idem_${randomBytes(12).toString("hex")}`;
}

/**
 * Deterministic idempotency key derived from a stable intent string.
 * Use this when the agent did not supply its own key — the same intent
 * should never accidentally double-fire on a retry.
 */
export function deriveIdempotencyKey(intent: string): string {
  // Lightweight FNV-1a 64-bit so we don't pull in a dependency.
  // Collisions are fine; the key is scoped to (toolName + siteId + payload).
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  let hash = FNV_OFFSET;
  for (let i = 0; i < intent.length; i++) {
    hash ^= BigInt(intent.charCodeAt(i));
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn;
  }
  return `idem_${hash.toString(16)}`;
}
