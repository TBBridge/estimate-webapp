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

  it("sends the decision notice via the decision-specific Gmail credentials", async () => {
    sqlQueue.push([
      { key: "decision_gmail_from", value: "overseas@cimtops.co.jp" },
      { key: "decision_gmail_password", value: "decision-app-pw" },
      // 申請通知用の値が入っていても影響しないこと
      { key: "gmail_from", value: "submission@example.com" },
      { key: "gmail_password", value: "submission-pw" },
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
      auth: { user: "overseas@cimtops.co.jp", pass: "decision-app-pw" },
    });
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "overseas@cimtops.co.jp",
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

  it("renders custom subject/body templates with placeholders", async () => {
    sqlQueue.push([
      { key: "decision_gmail_from", value: "overseas@cimtops.co.jp" },
      { key: "decision_gmail_password", value: "decision-app-pw" },
      {
        key: "decision_subject_template",
        value: "[{{decisionLabel}}] {{estimateNo}}",
      },
      {
        key: "decision_body_template",
        value: "{{recipientGreeting}}{{customerName}} 様の見積（{{estimateNo}}）を{{decisionLabel}}しました。",
      },
    ]);

    await sendAgencyDecisionGmailNotification({
      recipientEmail: "agency@example.com",
      recipientName: "山田 太郎",
      status: "approved",
      estimateNo: "EST-9999",
      customerName: "Acme",
      agencyName: "Agency One",
      decidedAt: "2026-05-18 10:00",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "[承認] EST-9999",
        text: "山田 太郎 様\n\nAcme 様の見積（EST-9999）を承認しました。",
      })
    );
  });

  it("returns an error result (no silent skip) when decision Gmail config is missing", async () => {
    sqlQueue.push([]); // app_settings 空

    const result = await sendAgencyDecisionGmailNotification({
      recipientEmail: "agency@example.com",
      status: "approved",
      estimateNo: "EST-0001",
      customerName: "Sample",
      agencyName: "Agency",
      decidedAt: "2026-05-18 10:00",
    });

    expect(result).toEqual({
      ok: false,
      error: "decision_gmail_config_missing",
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("returns an error result when recipientEmail is empty", async () => {
    const result = await sendAgencyDecisionGmailNotification({
      recipientEmail: "",
      status: "approved",
      estimateNo: "EST-0001",
      customerName: "Sample",
      agencyName: "Agency",
      decidedAt: "2026-05-18 10:00",
    });

    expect(result).toEqual({
      ok: false,
      error: "decision_recipient_email_missing",
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
