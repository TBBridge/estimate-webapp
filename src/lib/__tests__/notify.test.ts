import { describe, it, expect, beforeEach, vi } from "vitest";

const sqlQueue: unknown[][] = [];
const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));

const mockSql = (..._args: unknown[]): Promise<unknown[]> =>
  Promise.resolve(sqlQueue.shift() ?? []);

vi.mock("@/lib/db", () => ({
  getDb: () => mockSql,
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mockCreateTransport,
  },
}));

import { sendAgencyDecisionGmailNotification } from "../notify";

describe("sendAgencyDecisionGmailNotification", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    mockSendMail.mockReset();
    mockCreateTransport.mockClear();
  });

  it("sends the decision notice through Gmail to the agency contact email", async () => {
    sqlQueue.push([
      { key: "gmail_from", value: "sender@example.com" },
      { key: "gmail_password", value: "app-password" },
    ]);

    const result = await sendAgencyDecisionGmailNotification({
      recipientEmail: "agency@example.com",
      recipientName: "Request Owner",
      status: "rejected",
      estimateNo: "EST-0001",
      customerName: "Sample Customer",
      agencyName: "Agency One",
      decidedAt: "2026-05-17 09:50",
    });

    expect(result).toEqual({ ok: true });
    expect(mockCreateTransport).toHaveBeenCalledWith({
      service: "gmail",
      auth: { user: "sender@example.com", pass: "app-password" },
    });
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "sender@example.com",
        to: "agency@example.com",
        subject: expect.stringContaining("差し戻し"),
        text: expect.stringContaining("EST-0001"),
      })
    );
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Request Owner"),
      })
    );
  });
});
