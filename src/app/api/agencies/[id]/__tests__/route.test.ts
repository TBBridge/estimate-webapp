import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const sqlQueue: unknown[][] = [];
let getDbCallCount = 0;

const mockSql = (..._args: unknown[]): Promise<unknown[]> =>
  Promise.resolve(sqlQueue.shift() ?? []);

vi.mock("@/lib/db", () => ({
  getDb: () => {
    getDbCallCount += 1;
    return mockSql;
  },
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));

import { GET } from "../route";
import { getSessionCookieName, signSession } from "@/lib/auth/session";

const TEST_SECRET = "0".repeat(64);

async function signValidCookie(input: Parameters<typeof signSession>[0]): Promise<string> {
  const { token } = await signSession(input);
  return `${getSessionCookieName()}=${encodeURIComponent(token)}`;
}

function makeRequest(cookie: string): Request {
  return new Request("https://example.com/api/agencies/ag-1", {
    method: "GET",
    headers: { cookie },
  });
}

function responseBody(res: unknown): Record<string, unknown> {
  return (res as { body: Record<string, unknown> }).body;
}

const agencyRow = {
  id: "ag-1",
  name: "Agency One",
  login_id: "agency-one",
  email: "agency@example.com",
  agency_type: "partner",
  contact_name: "Taro Agency",
  department: "Sales",
  phone_country_code: "+81",
  phone_local: "03-1234-5678",
  approver_name: "Approver",
  approver_email: "approver@example.com",
  created_at: "2026-05-13",
};

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", TEST_SECRET);
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");
  sqlQueue.length = 0;
  getDbCallCount = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  sqlQueue.length = 0;
  getDbCallCount = 0;
});

describe("GET /api/agencies/[id]", () => {
  it("rejects unauthenticated requests before loading the agency profile", async () => {
    const res = await GET(makeRequest(""), {
      params: Promise.resolve({ id: "ag-1" }),
    });

    expect((res as { status: number }).status).toBe(401);
    expect(getDbCallCount).toBe(0);
  });

  it("allows an agency user to fetch their own contact profile for estimate defaults", async () => {
    const cookie = await signValidCookie({ sub: "ag-1", role: "agency", agencyId: "ag-1" });
    sqlQueue.push([]);
    sqlQueue.push([agencyRow]);

    const res = await GET(makeRequest(cookie), {
      params: Promise.resolve({ id: "ag-1" }),
    });

    expect((res as { status: number }).status).toBe(200);
    expect(responseBody(res)).toMatchObject({
      id: "ag-1",
      name: "Agency One",
      loginId: "agency-one",
      email: "agency@example.com",
      contactName: "Taro Agency",
      department: "Sales",
      phoneCountryCode: "+81",
      phoneLocal: "03-1234-5678",
    });
  });

  it("rejects an agency user fetching another agency profile", async () => {
    const cookie = await signValidCookie({ sub: "ag-2", role: "agency", agencyId: "ag-2" });
    sqlQueue.push([]);

    const res = await GET(makeRequest(cookie), {
      params: Promise.resolve({ id: "ag-1" }),
    });

    expect((res as { status: number }).status).toBe(403);
  });

  it("allows an admin user to fetch any agency profile", async () => {
    const cookie = await signValidCookie({ sub: "admin-1", role: "admin" });
    sqlQueue.push([]);
    sqlQueue.push([agencyRow]);

    const res = await GET(makeRequest(cookie), {
      params: Promise.resolve({ id: "ag-1" }),
    });

    expect((res as { status: number }).status).toBe(200);
    expect(responseBody(res)).toMatchObject({
      id: "ag-1",
      name: "Agency One",
    });
  });
});
