import { describe, expect, it } from "vitest";
import { redact } from "@wix-mcp/core";

describe("redact", () => {
  it("redacts sensitive keys", () => {
    const out = redact({
      apiKey: "abc",
      Authorization: "Bearer x",
      password: "p",
      cardNumber: "4242",
      nested: { secret: "s", normal: "n" },
    }) as Record<string, unknown>;
    expect(out["apiKey"]).toBe("[REDACTED]");
    expect(out["Authorization"]).toBe("[REDACTED]");
    expect(out["password"]).toBe("[REDACTED]");
    expect(out["cardNumber"]).toBe("[REDACTED]");
    expect((out["nested"] as Record<string, unknown>)["secret"]).toBe("[REDACTED]");
    expect((out["nested"] as Record<string, unknown>)["normal"]).toBe("n");
  });

  it("redacts pii keys with partial mask when requested", () => {
    const out = redact({ email: "alice@example.com" }, { partialPii: true }) as Record<
      string,
      unknown
    >;
    expect(typeof out["email"]).toBe("string");
    expect(out["email"]).toMatch(/\*+\.com$/);
  });

  it("handles arrays and primitives", () => {
    expect(redact([1, 2, "x"])).toEqual([1, 2, "x"]);
    expect(redact(null)).toBeNull();
    expect(redact(true)).toBe(true);
  });
});
