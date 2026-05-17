import { describe, it, expect, beforeEach, vi } from "vitest";

const sqlQueue: unknown[][] = [];
let sqlCallCount = 0;

const mockSql = (..._args: unknown[]): Promise<unknown[]> => {
  sqlCallCount += 1;
  return Promise.resolve(sqlQueue.shift() ?? []);
};

vi.mock("@/lib/db", () => ({
  getDb: () => mockSql,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: vi.fn(() => Promise.resolve({ sub: "ag-1", role: "agency", agencyId: "ag-1" })),
  handleAuthError: vi.fn(() => null),
}));

vi.mock("@/lib/notify", () => ({
  sendApprovalNotification: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));

import { POST } from "../route";

function makeSubmitRequest(formInputs: Record<string, unknown>): Request {
  return new Request("https://example.com/api/estimates/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agencyId: "ag-1",
      agencyName: "Agency One",
      customerName: "Sample Customer",
      deliveryType: "cloud",
      contractType: "new",
      cloudBilling: "annual",
      formInputs,
    }),
  });
}

function responseBody(res: unknown): Record<string, unknown> {
  return (res as { body: Record<string, unknown> }).body;
}

describe("POST /api/estimates/submit", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlCallCount = 0;
  });

  it("rejects submissions without estimate requester name and email before writing to the database", async () => {
    const res = await POST(makeSubmitRequest({ userCompanyNameJa: "Sample Customer" }));

    expect((res as { status: number }).status).toBe(400);
    expect(responseBody(res)).toEqual({ error: "estimate_requester_required" });
    expect(sqlCallCount).toBe(0);
  });
});
