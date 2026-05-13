import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const sqlQueue: unknown[][] = [];

const mockSql = (..._args: unknown[]): Promise<unknown[]> =>
  Promise.resolve(sqlQueue.shift() ?? []);

vi.mock("@/lib/db", () => ({
  getDb: () => mockSql,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
  },
}));

import { POST } from "../route";
import { hashPassword } from "@/lib/auth/password";

const TEST_SECRET = "0".repeat(64);

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
  sqlQueue.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  sqlQueue.length = 0;
});

describe("POST /api/auth/login", () => {
  it("allows a system user to sign in with a non-email login ID", async () => {
    const passwordHash = await hashPassword("password");
    sqlQueue.push([
      {
        id: "u-1",
        name: "Admin",
        login_id: "admin#01",
        email: "admin@example.com",
        role: "admin",
        password: "",
        password_hash: passwordHash,
      },
    ]);
    sqlQueue.push([]);
    sqlQueue.push([]);

    const res = await POST(makeRequest({ loginId: "admin#01", password: "password" }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      id: "u-1",
      name: "Admin",
      loginId: "admin#01",
      email: "admin@example.com",
      role: "admin",
    });
    expect(res.headers.get("Set-Cookie")).toContain("est_session=");
  });

  it("allows an agency user to sign in with a non-email login ID", async () => {
    const passwordHash = await hashPassword("password");
    sqlQueue.push([]);
    sqlQueue.push([
      {
        id: "ag-1",
        name: "Agency One",
        login_id: "sales-team#01",
        email: "agency@example.com",
        login_password: "",
        password_hash: passwordHash,
      },
    ]);
    sqlQueue.push([]);

    const res = await POST(makeRequest({ loginId: "sales-team#01", password: "password" }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      id: "ag-1",
      name: "Agency One",
      loginId: "sales-team#01",
      email: "agency@example.com",
      role: "agency",
      agencyId: "ag-1",
    });
  });
});
