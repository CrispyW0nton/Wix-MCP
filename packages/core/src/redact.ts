/**
 * Redaction helpers for audit + log output.
 *
 * Intentionally conservative: the audit log is the source of truth when
 * something goes wrong, but it must never leak secrets, payment tokens,
 * or raw PII payloads.
 */

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /apikey|api[-_]?key/i,
  /cookie/i,
  /credit[-_]?card|cardnumber|cvv|cvc/i,
  /bankaccount|iban|routingnumber/i,
  /ssn|social[-_]?security/i,
];

const PII_KEY_PATTERNS = [/email/i, /phone/i, /address/i, /dateofbirth|dob/i];

const REDACTED = "[REDACTED]";
const PARTIAL = "[REDACTED:partial]";

export interface RedactOptions {
  /** When true, mask but keep last 4 chars of strings (helpful for IDs). */
  partialPii?: boolean;
}

export function redact(
  value: unknown,
  options: RedactOptions = {},
  depth = 0,
): unknown {
  if (depth > 6) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, options, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERNS.some((re) => re.test(k))) {
        out[k] = REDACTED;
        continue;
      }
      if (PII_KEY_PATTERNS.some((re) => re.test(k))) {
        out[k] = options.partialPii ? maskKeepLast(v, 4) : PARTIAL;
        continue;
      }
      out[k] = redact(v, options, depth + 1);
    }
    return out;
  }
  return REDACTED;
}

function maskKeepLast(value: unknown, keep: number): string {
  if (typeof value !== "string") return PARTIAL;
  if (value.length <= keep) return "*".repeat(value.length);
  return "*".repeat(value.length - keep) + value.slice(-keep);
}
