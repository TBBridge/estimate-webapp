import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendAgencyDecisionGmailNotification: vi.fn(),
}));

const sqlQueue: unknown[][] = [];

const mockSql = (..._args: unknown[]): Promise<unknown[]> =>
  Promise.resolve(sqlQueue.shift() ?? []);

vi.mock("@/lib/db", () => ({
  getDb: () => mockSql,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAdminOrApprover: vi.fn(() => Promise.resolve({ sub: "approver-1", role: "approver" })),
  requireAdmin: vi.fn(),
  requireEstimateAccess: vi.fn(),
  handleAuthError: vi.fn(() => null),
}));

vi.mock("@/lib/notify", () => ({
  sendAgencyDecisionGmailNotification: mocks.sendAgencyDecisionGmailNotification,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/hubspot-env", () => ({
  getHubSpotConfig: vi.fn(() => null),
}));

import { PUT } from "../route";

function makeStatusRequest(status: "approved" | "rejected"): Request {
  return new Request("https://example.com/api/estimates/est-1", {
    method: "PUT",
    body: JSON.stringify({ status }),
    headers: { "Content-Type": "application/json" },
  });
}

function responseBody(res: unknown): Record<string, unknown> {
  return (res as { body: Record<string, unknown> }).body;
}

const currentEstimateRow = {
  id: "est-1",
  no: "EST-0001",
  status: "pending",
  customer_name: "Sample Customer",
  contract_type: "renewal",
  agency_id: "ag-1",
  agency_name: "Agency One",
  delivery_type: "cloud",
  cloud_billing: null,
  pdf_url: "https://example.com/estimate.pdf",
  excel_url: "",
  amount: 1000,
  maintenance_fee: 100,
  form_inputs: {},
};

describe("PUT /api/estimates/[id]", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    mocks.sendAgencyDecisionGmailNotification.mockReset();
  });

  it.each(["approved", "rejected"] as const)(
    "sends a Gmail notification to the estimate agency contact when an approver marks it %s",
    async (status) => {
      mocks.sendAgencyDecisionGmailNotification.mockResolvedValue({ ok: true });
      sqlQueue.push([currentEstimateRow]);
      sqlQueue.push([
        {
          ...currentEstimateRow,
          status,
          approved_at: status === "approved" ? "2026/05/17 09:50" : null,
        },
      ]);
      sqlQueue.push([{ email: "agency@example.com" }]);

      const res = await PUT(makeStatusRequest(status), {
        params: Promise.resolve({ id: "est-1" }),
      });

      expect((res as { status: number }).status).toBe(200);
      expect(responseBody(res)).toMatchObject({
        id: "est-1",
        no: "EST-0001",
        status,
        agencyNotification: { ok: true },
      });
      expect(mocks.sendAgencyDecisionGmailNotification).toHaveBeenCalledWith({
        recipientEmail: "agency@example.com",
        status,
        estimateNo: "EST-0001",
        customerName: "Sample Customer",
        agencyName: "Agency One",
        decidedAt: expect.any(String),
      });
    }
  );
});
