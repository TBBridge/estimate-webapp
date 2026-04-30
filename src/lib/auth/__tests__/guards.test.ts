/**
 * Unit tests for src/lib/auth/guards.ts
 *
 * External dependencies mocked:
 *   - @/lib/db  → stateful sqlQueue-based mock
 *   - next/server → thin NextResponse stub (no Next.js runtime needed)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── DB mock (must be hoisted before module imports) ─────────────────────────

/**
 * A queue of result rows. Each test pushes the responses it needs;
 * mockSql pulls one entry per call.
 */
const sqlQueue: unknown[][] = [];

/**
 * mockSql is a tagged-template-compatible function.
 * `@neondatabase/serverless` calls sql`SELECT …` as sql(strings, ...values).
 * We ignore the arguments and just return the next queued result.
 */
const mockSql = (..._args: unknown[]): Promise<unknown[]> =>
  Promise.resolve(sqlQueue.shift() ?? []);

vi.mock("@/lib/db", () => ({
  getDb: () => mockSql,
}));

// ─── next/server mock ─────────────────────────────────────────────────────────
// Guards imports NextResponse for authErrorToResponse. Provide a minimal stub.

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({ body, status: init?.status ?? 200 }),
  },
}));

// ─── SUT imports (after mocks) ───────────────────────────────────────────────

import {
  getSession,
  requireAuth,
  requireRole,
  requireAdmin,
  requireAdminOrApprover,
  requireEstimateAccess,
  AuthError,
} from "../guards";

import {
  signSession,
  SESSION_COOKIE_NAME,
} from "../session";

// ─── helpers ────────────────────────────────────────────────────────────────

const TEST_SECRET = "0".repeat(64);

interface MakeRequestOptions {
  method?: string;
  cookie?: string;
  origin?: string;
}

function makeRequest({ method = "GET", cookie, origin }: MakeRequestOptions = {}): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  if (origin) headers["origin"] = origin;
  return new Request("https://example.com/api/test", { method, headers });
}

/**
 * Sign a real JWT and return the Cookie header value for the session cookie.
 */
async function signValidCookie(
  payload: Parameters<typeof signSession>[0]
): Promise<string> {
  const { token } = await signSession(payload);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

// ─── setup / teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
  sqlQueue.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  sqlQueue.length = 0;
});

// ─── getSession ──────────────────────────────────────────────────────────────

describe("getSession", () => {
  it("returns null when there is no Cookie header", async () => {
    const req = makeRequest();
    expect(await getSession(req)).toBeNull();
  });

  it("returns session when cookie is valid and jti is not revoked", async () => {
    const cookie = await signValidCookie({ sub: "u1", role: "admin" });
    // DB returns no revocation rows
    sqlQueue.push([]);
    const req = makeRequest({ cookie });
    const session = await getSession(req);
    expect(session).not.toBeNull();
    expect(session!.sub).toBe("u1");
    expect(session!.role).toBe("admin");
  });

  it("returns null when the jti is found in session_revocations", async () => {
    const cookie = await signValidCookie({ sub: "u2", role: "admin" });
    // DB returns a revocation row
    sqlQueue.push([{ "1": 1 }]);
    const req = makeRequest({ cookie });
    expect(await getSession(req)).toBeNull();
  });

  it("returns null when the cookie value is malformed", async () => {
    const req = makeRequest({ cookie: `${SESSION_COOKIE_NAME}=not-a-jwt-at-all` });
    expect(await getSession(req)).toBeNull();
  });

  it("returns null when cookie header has an unrelated cookie name", async () => {
    const req = makeRequest({ cookie: "other-cookie=value123" });
    expect(await getSession(req)).toBeNull();
  });
});

// ─── requireAuth ─────────────────────────────────────────────────────────────

describe("requireAuth", () => {
  it("throws AuthError(401, 'unauthenticated') when there is no session", async () => {
    const req = makeRequest();
    await expect(requireAuth(req)).rejects.toMatchObject({
      status: 401,
      code: "unauthenticated",
    });
  });

  it("returns session when cookie is valid", async () => {
    const cookie = await signValidCookie({ sub: "u3", role: "approver" });
    sqlQueue.push([]); // no revocation
    const req = makeRequest({ cookie });
    const session = await requireAuth(req);
    expect(session.sub).toBe("u3");
  });

  describe("CSRF origin check", () => {
    it("throws AuthError(403, 'csrf_origin_mismatch') on POST with mismatching Origin when env is set", async () => {
      vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://app.example.com");
      const cookie = await signValidCookie({ sub: "u4", role: "admin" });
      sqlQueue.push([]);
      const req = makeRequest({
        method: "POST",
        cookie,
        origin: "https://attacker.com",
      });
      await expect(requireAuth(req)).rejects.toMatchObject({
        status: 403,
        code: "csrf_origin_mismatch",
      });
    });

    it("passes on POST when Origin matches NEXT_PUBLIC_BASE_URL", async () => {
      vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://app.example.com");
      const cookie = await signValidCookie({ sub: "u5", role: "admin" });
      sqlQueue.push([]);
      const req = makeRequest({
        method: "POST",
        cookie,
        origin: "https://app.example.com",
      });
      const session = await requireAuth(req);
      expect(session.sub).toBe("u5");
    });

    it("passes on POST when NEXT_PUBLIC_BASE_URL is unset and NODE_ENV is not production", async () => {
      // env already cleared in beforeEach (empty string → falsy after trim)
      vi.stubEnv("NODE_ENV", "test");
      const cookie = await signValidCookie({ sub: "u6", role: "admin" });
      sqlQueue.push([]);
      const req = makeRequest({
        method: "POST",
        cookie,
        origin: "https://anything.com",
      });
      const session = await requireAuth(req);
      expect(session.sub).toBe("u6");
    });

    it("hard-fails on POST when NEXT_PUBLIC_BASE_URL is unset in production", async () => {
      vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
      vi.stubEnv("NODE_ENV", "production");
      const cookie = await signValidCookie({ sub: "u6b", role: "admin" });
      const req = makeRequest({
        method: "POST",
        cookie,
        origin: "https://anything.com",
      });
      await expect(requireAuth(req)).rejects.toMatchObject({
        status: 500,
        code: "csrf_config_missing",
      });
    });

    it("passes on GET even with a mismatching Origin", async () => {
      vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://app.example.com");
      const cookie = await signValidCookie({ sub: "u7", role: "admin" });
      sqlQueue.push([]);
      const req = makeRequest({
        method: "GET",
        cookie,
        origin: "https://attacker.com",
      });
      const session = await requireAuth(req);
      expect(session.sub).toBe("u7");
    });
  });
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe("requireRole", () => {
  it("returns session when role matches the allowed list", async () => {
    const cookie = await signValidCookie({ sub: "u8", role: "approver" });
    sqlQueue.push([]);
    const req = makeRequest({ cookie });
    const session = await requireRole(req, ["admin", "approver"]);
    expect(session.role).toBe("approver");
  });

  it("throws AuthError(403, 'forbidden') when role is not in the allowed list", async () => {
    const cookie = await signValidCookie({ sub: "u9", role: "agency" });
    sqlQueue.push([]);
    const req = makeRequest({ cookie });
    await expect(requireRole(req, ["admin", "approver"])).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });
});

// ─── requireAdmin ────────────────────────────────────────────────────────────

describe("requireAdmin", () => {
  it("passes for admin role", async () => {
    const cookie = await signValidCookie({ sub: "u10", role: "admin" });
    sqlQueue.push([]);
    const session = await requireAdmin(makeRequest({ cookie }));
    expect(session.role).toBe("admin");
  });

  it("throws for approver role", async () => {
    const cookie = await signValidCookie({ sub: "u11", role: "approver" });
    sqlQueue.push([]);
    await expect(requireAdmin(makeRequest({ cookie }))).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });
});

// ─── requireAdminOrApprover ──────────────────────────────────────────────────

describe("requireAdminOrApprover", () => {
  it("passes for admin", async () => {
    const cookie = await signValidCookie({ sub: "u12", role: "admin" });
    sqlQueue.push([]);
    const session = await requireAdminOrApprover(makeRequest({ cookie }));
    expect(session.role).toBe("admin");
  });

  it("passes for approver", async () => {
    const cookie = await signValidCookie({ sub: "u13", role: "approver" });
    sqlQueue.push([]);
    const session = await requireAdminOrApprover(makeRequest({ cookie }));
    expect(session.role).toBe("approver");
  });

  it("rejects agency role with 403", async () => {
    const cookie = await signValidCookie({ sub: "u14", role: "agency", agencyId: "ag-1" });
    sqlQueue.push([]);
    await expect(requireAdminOrApprover(makeRequest({ cookie }))).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });
});

// ─── requireEstimateAccess ────────────────────────────────────────────────────

describe("requireEstimateAccess", () => {
  it("admin passes regardless of agency_id mismatch (no DB call needed)", async () => {
    const cookie = await signValidCookie({ sub: "u15", role: "admin" });
    sqlQueue.push([]); // getSession revocation check
    const session = await requireEstimateAccess(makeRequest({ cookie }), "est-1");
    expect(session.role).toBe("admin");
  });

  it("approver passes regardless of agency_id (no DB call needed)", async () => {
    const cookie = await signValidCookie({ sub: "u16", role: "approver" });
    sqlQueue.push([]);
    const session = await requireEstimateAccess(makeRequest({ cookie }), "est-1");
    expect(session.role).toBe("approver");
  });

  it("agency role with matching agency_id: passes", async () => {
    const cookie = await signValidCookie({ sub: "u17", role: "agency", agencyId: "ag-7" });
    sqlQueue.push([]); // revocation
    sqlQueue.push([{ agency_id: "ag-7" }]); // estimate lookup
    const session = await requireEstimateAccess(makeRequest({ cookie }), "est-7");
    expect(session.role).toBe("agency");
    expect(session.agencyId).toBe("ag-7");
  });

  it("agency role with mismatching agency_id: throws AuthError(403)", async () => {
    const cookie = await signValidCookie({ sub: "u18", role: "agency", agencyId: "ag-7" });
    sqlQueue.push([]); // revocation
    sqlQueue.push([{ agency_id: "ag-OTHER" }]); // estimate belongs to different agency
    await expect(
      requireEstimateAccess(makeRequest({ cookie }), "est-7")
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("estimate not found: throws AuthError(404, 'not_found')", async () => {
    const cookie = await signValidCookie({ sub: "u19", role: "agency", agencyId: "ag-7" });
    sqlQueue.push([]); // revocation
    sqlQueue.push([]); // estimate query returns empty
    await expect(
      requireEstimateAccess(makeRequest({ cookie }), "est-nonexistent")
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("agency role without agencyId in session: throws AuthError(403)", async () => {
    // Sign without agencyId — valid JWT but missing agencyId
    const cookie = await signValidCookie({ sub: "u20", role: "agency" });
    sqlQueue.push([]); // revocation
    await expect(
      requireEstimateAccess(makeRequest({ cookie }), "est-1")
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
});

// ─── AuthError utility ───────────────────────────────────────────────────────

describe("AuthError", () => {
  it("is an instance of Error with status and code fields", () => {
    const err = new AuthError(403, "forbidden", "custom message");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.code).toBe("forbidden");
    expect(err.message).toBe("custom message");
  });

  it("uses code as message when no explicit message is provided", () => {
    const err = new AuthError(401, "unauthenticated");
    expect(err.message).toBe("unauthenticated");
  });
});

// ─── authErrorToResponse / handleAuthError utilities ─────────────────────────

import { authErrorToResponse, handleAuthError } from "../guards";

describe("authErrorToResponse", () => {
  it("returns a response-shaped object with the correct status and error body", () => {
    const err = new AuthError(403, "forbidden");
    const res = authErrorToResponse(err);
    expect((res as { status: number }).status).toBe(403);
    expect((res as { body: unknown }).body).toEqual({ error: "forbidden" });
  });
});

describe("handleAuthError", () => {
  it("returns a NextResponse for AuthError instances", () => {
    const err = new AuthError(401, "unauthenticated");
    const res = handleAuthError(err);
    expect(res).not.toBeNull();
    expect((res as { status: number }).status).toBe(401);
  });

  it("returns null for non-AuthError values", () => {
    expect(handleAuthError(new Error("some other error"))).toBeNull();
    expect(handleAuthError("string error")).toBeNull();
    expect(handleAuthError(null)).toBeNull();
  });
});

// ─── CSRF — invalid URL in Origin header ─────────────────────────────────────

describe("requireAuth CSRF — invalid origin URL", () => {
  it("throws AuthError(403, 'csrf_origin_invalid') when Origin is not a valid URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://app.example.com");
    const cookie = await signValidCookie({ sub: "u30", role: "admin" });
    sqlQueue.push([]);
    const req = makeRequest({
      method: "POST",
      cookie,
      origin: "not-a-url",
    });
    await expect(requireAuth(req)).rejects.toMatchObject({
      status: 403,
      code: "csrf_origin_invalid",
    });
  });
});

// ─── isRevoked DB error path (safety-side: returns true) ─────────────────────

describe("getSession — DB error treated as revoked", () => {
  it("returns null when the DB throws during revocation check", async () => {
    // Replace mockSql with a throwing version just for this test
    const throwingSql = (..._args: unknown[]): Promise<unknown[]> =>
      Promise.reject(new Error("DB connection lost"));

    vi.doMock("@/lib/db", () => ({ getDb: () => throwingSql }));

    // Because vi.doMock doesn't re-import already-imported modules,
    // we verify the behaviour via the isRevoked contract: a DB error
    // must cause getSession to return null (fail-safe).
    // We test this by making sqlQueue throw via a custom rejection.
    sqlQueue.push("THROW" as unknown as unknown[]);
    // Override mockSql for this call to throw
    const origShift = sqlQueue.shift.bind(sqlQueue);
    let shifted = false;
    vi.spyOn(sqlQueue, "shift").mockImplementationOnce(() => {
      shifted = true;
      throw new Error("simulated DB error");
    });

    const cookie = await signValidCookie({ sub: "u31", role: "admin" });
    const req = makeRequest({ cookie });

    // The guards module uses the module-level mockSql which calls sqlQueue.shift().
    // When that throws, isRevoked catches and returns true → getSession returns null.
    const session = await getSession(req);
    expect(session).toBeNull();
    expect(shifted).toBe(true);
  });
});

// ─── extractTokenFromRequest — decodeURIComponent throws ─────────────────────

describe("getSession — malformed percent-encoded cookie value", () => {
  it("returns null when the cookie value contains an invalid percent-escape", async () => {
    // %ZZ is not valid percent-encoding and causes decodeURIComponent to throw
    const req = makeRequest({
      cookie: `${SESSION_COOKIE_NAME}=%ZZ`,
    });
    expect(await getSession(req)).toBeNull();
  });
});
