/**
 * Unit tests for src/lib/auth/session.ts
 *
 * TDD: RED → GREEN → REFACTOR
 * Environment: node (jose uses Web Crypto, available in Node 18+)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";

import {
  signSession,
  verifySessionToken,
  renewSession,
  shouldRenewSession,
  buildSessionCookie,
  buildClearSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_TTL_SEC,
  SESSION_ABSOLUTE_TTL_SEC,
  SESSION_RENEW_THRESHOLD_RATIO,
} from "../session";

// ─── helpers ────────────────────────────────────────────────────────────────

const TEST_SECRET = "0".repeat(64);

function secretKey(): Uint8Array {
  return new TextEncoder().encode(TEST_SECRET);
}

/**
 * Build a JWT manually — lets tests control every claim including invalid ones.
 */
async function buildRawJwt(
  claims: Record<string, unknown>,
  secret: Uint8Array = secretKey()
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT(claims as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("estimate-webapp")
    .setAudience("estimate-webapp")
    .setIssuedAt(now);

  if (typeof claims.exp === "number") {
    builder.setExpirationTime(claims.exp);
  }
  if (typeof claims.sub === "string") {
    builder.setSubject(claims.sub);
  }
  if (typeof claims.jti === "string") {
    builder.setJti(claims.jti);
  }

  return builder.sign(secret);
}

// ─── setup / teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// ─── signSession + verifySessionToken round-trips ───────────────────────────

describe("signSession + verifySessionToken round-trip", () => {
  it("admin role — preserves all fields, agencyId undefined", async () => {
    const { token } = await signSession({ sub: "user-1", role: "admin" });
    const session = await verifySessionToken(token);

    expect(session).not.toBeNull();
    expect(session!.sub).toBe("user-1");
    expect(session!.role).toBe("admin");
    expect(session!.agencyId).toBeUndefined();
    expect(typeof session!.jti).toBe("string");
    expect(typeof session!.exp).toBe("number");
    expect(typeof session!.iat0).toBe("number");
  });

  it("approver role — round-trip succeeds", async () => {
    const { token } = await signSession({ sub: "user-2", role: "approver" });
    const session = await verifySessionToken(token);

    expect(session).not.toBeNull();
    expect(session!.role).toBe("approver");
    expect(session!.agencyId).toBeUndefined();
  });

  it("agency role — agencyId is preserved when provided", async () => {
    const { token } = await signSession({
      sub: "agency-99",
      role: "agency",
      agencyId: "ag-99",
    });
    const session = await verifySessionToken(token);

    expect(session).not.toBeNull();
    expect(session!.role).toBe("agency");
    expect(session!.agencyId).toBe("ag-99");
  });

  it("agency role — agencyId is undefined when omitted", async () => {
    const { token } = await signSession({ sub: "agency-100", role: "agency" });
    const session = await verifySessionToken(token);

    expect(session).not.toBeNull();
    expect(session!.agencyId).toBeUndefined();
  });
});

// ─── verifySessionToken — tampered / wrong-secret tokens ────────────────────

describe("verifySessionToken rejects invalid tokens", () => {
  it("returns null on tampered signature (flipped byte in last segment)", async () => {
    const { token } = await signSession({ sub: "user-1", role: "admin" });
    const parts = token.split(".");
    // Flip a character in the signature segment (base64url)
    const sig = parts[2];
    const flipped =
      sig[0] === "A"
        ? "B" + sig.slice(1)
        : "A" + sig.slice(1);
    const tampered = [parts[0], parts[1], flipped].join(".");

    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("returns null on token signed with a different AUTH_SECRET", async () => {
    const otherSecret = new TextEncoder().encode("X".repeat(64));
    const now = Math.floor(Date.now() / 1000);
    const token = await buildRawJwt(
      {
        sub: "user-1",
        role: "admin",
        jti: crypto.randomUUID(),
        iat0: now,
        exp: now + SESSION_IDLE_TTL_SEC,
      },
      otherSecret
    );

    expect(await verifySessionToken(token)).toBeNull();
  });

  it("returns null on a completely malformed string", async () => {
    expect(await verifySessionToken("not.a.jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });
});

// ─── verifySessionToken — expired tokens ────────────────────────────────────

describe("verifySessionToken expiry handling", () => {
  it("returns null when iat0 + ABSOLUTE_TTL is in the past (>7 days elapsed)", async () => {
    const { token } = await signSession({ sub: "user-1", role: "admin" });

    // Advance time beyond the absolute TTL
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (SESSION_ABSOLUTE_TTL_SEC + 60) * 1000);

    expect(await verifySessionToken(token)).toBeNull();
  });

  it("returns null when token is past its exp (>8h elapsed, <7d)", async () => {
    // Sign at t=0
    const { token } = await signSession({ sub: "user-1", role: "admin" });

    // Advance beyond the 8h idle TTL but stay within the 7d absolute limit
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (SESSION_IDLE_TTL_SEC + 60) * 1000);

    expect(await verifySessionToken(token)).toBeNull();
  });
});

// ─── verifySessionToken — invalid role claim ─────────────────────────────────

describe("verifySessionToken rejects invalid role", () => {
  it("returns null when role is an unrecognised value", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await buildRawJwt({
      sub: "user-evil",
      role: "evil",
      jti: crypto.randomUUID(),
      iat0: now,
      exp: now + SESSION_IDLE_TTL_SEC,
    });

    expect(await verifySessionToken(token)).toBeNull();
  });
});

// ─── verifySessionToken — missing / wrong-typed required claims ───────────────

describe("verifySessionToken rejects missing or wrong-typed claims", () => {
  it("returns null when exp is missing from payload", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await buildRawJwt({
      sub: "user-1",
      role: "admin",
      jti: crypto.randomUUID(),
      iat0: now,
      // no exp
    });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("returns null when iat0 is missing from payload", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await buildRawJwt({
      sub: "user-1",
      role: "admin",
      jti: crypto.randomUUID(),
      exp: now + SESSION_IDLE_TTL_SEC,
      // no iat0
    });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("returns null when agencyId is present but not a string", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await buildRawJwt({
      sub: "user-1",
      role: "agency",
      jti: crypto.randomUUID(),
      iat0: now,
      exp: now + SESSION_IDLE_TTL_SEC,
      agencyId: 12345, // number, not string
    });
    expect(await verifySessionToken(token)).toBeNull();
  });
});

// ─── renewSession ───────────────────────────────────────────────────────────

describe("renewSession", () => {
  it("extends exp but keeps iat0, jti, sub, role, agencyId", async () => {
    const { token } = await signSession({
      sub: "user-1",
      role: "agency",
      agencyId: "ag-42",
    });
    const original = await verifySessionToken(token);
    expect(original).not.toBeNull();

    // Advance time by 1 hour (well within both TTLs)
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3600 * 1000);

    const renewed = await renewSession(original!);
    expect(renewed).not.toBeNull();

    const renewedSession = await verifySessionToken(renewed!.token);
    expect(renewedSession).not.toBeNull();
    expect(renewedSession!.sub).toBe(original!.sub);
    expect(renewedSession!.role).toBe(original!.role);
    expect(renewedSession!.agencyId).toBe(original!.agencyId);
    expect(renewedSession!.jti).toBe(original!.jti);
    expect(renewedSession!.iat0).toBe(original!.iat0);
    // exp must be later than original
    expect(renewedSession!.exp).toBeGreaterThan(original!.exp);
  });

  it("returns null when called past the absolute cutoff (>7 days from iat0)", async () => {
    const { token } = await signSession({ sub: "user-1", role: "admin" });
    const original = await verifySessionToken(token);

    // Advance past 7-day absolute limit
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (SESSION_ABSOLUTE_TTL_SEC + 60) * 1000);

    expect(await renewSession(original!)).toBeNull();
  });
});

// ─── shouldRenewSession ──────────────────────────────────────────────────────

describe("shouldRenewSession", () => {
  it("returns false when remaining time is above 50% of idle TTL", async () => {
    const { token } = await signSession({ sub: "user-1", role: "admin" });
    const session = await verifySessionToken(token);
    expect(session).not.toBeNull();

    // Immediately after signing, remaining ≈ SESSION_IDLE_TTL_SEC → above 50%
    expect(shouldRenewSession(session!)).toBe(false);
  });

  it("returns true when remaining time is below 50% of idle TTL", async () => {
    const { token } = await signSession({ sub: "user-1", role: "admin" });
    const session = await verifySessionToken(token);
    expect(session).not.toBeNull();

    // Advance time so that remaining < 50% of 8h = 4h
    const advanceSec = SESSION_IDLE_TTL_SEC * SESSION_RENEW_THRESHOLD_RATIO + 60;
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + advanceSec * 1000);

    expect(shouldRenewSession(session!)).toBe(true);
  });

  it("returns false when session is already expired (remaining <= 0)", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredSession = {
      sub: "u",
      role: "admin" as const,
      jti: "j",
      exp: now - 1,
      iat0: now - SESSION_IDLE_TTL_SEC - 1,
    };
    expect(shouldRenewSession(expiredSession)).toBe(false);
  });
});

// ─── buildSessionCookie / buildClearSessionCookie ────────────────────────────

describe("buildSessionCookie", () => {
  it("produces a __Host- prefixed Set-Cookie string with all required attributes", async () => {
    const { token, expiresAt } = await signSession({ sub: "u", role: "admin" });
    const header = buildSessionCookie(token, expiresAt);

    expect(header).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=");
    expect(header.startsWith("__Host-")).toBe(true);
    // Must NOT include Domain
    expect(header).not.toContain("Domain=");
  });

  it("sets Max-Age > 0 for a fresh token", async () => {
    const { token, expiresAt } = await signSession({ sub: "u", role: "admin" });
    const header = buildSessionCookie(token, expiresAt);
    const match = /Max-Age=(\d+)/.exec(header);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });
});

describe("buildClearSessionCookie", () => {
  it("produces a __Host- prefixed cookie with Max-Age=0 and empty value", () => {
    const header = buildClearSessionCookie();

    expect(header).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=0");
    expect(header.startsWith("__Host-")).toBe(true);
  });
});

// ─── AUTH_SECRET validation ──────────────────────────────────────────────────

describe("getSecretKey (via signSession) validates AUTH_SECRET", () => {
  it("throws when AUTH_SECRET is unset (empty string)", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    await expect(
      signSession({ sub: "u", role: "admin" })
    ).rejects.toThrow();
  });

  it("throws when AUTH_SECRET is shorter than 32 characters", async () => {
    vi.stubEnv("AUTH_SECRET", "short");
    await expect(
      signSession({ sub: "u", role: "admin" })
    ).rejects.toThrow();
  });

  it("succeeds when AUTH_SECRET is exactly 32 characters long", async () => {
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    await expect(
      signSession({ sub: "u", role: "admin" })
    ).resolves.toBeDefined();
  });
});
