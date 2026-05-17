import { describe, it, expect } from "vitest";

import {
  ESTIMATE_REQUESTER_FIELDS,
  validateEstimateRequesterContact,
} from "../estimate-schema";

describe("estimate requester contact fields", () => {
  it("defines requester name and email as required fields", () => {
    expect(ESTIMATE_REQUESTER_FIELDS).toEqual([
      expect.objectContaining({
        id: "estimateRequesterName",
        kind: "text",
        required: true,
      }),
      expect.objectContaining({
        id: "estimateRequesterEmail",
        kind: "email",
        required: true,
      }),
    ]);
  });

  it("requires a requester name and valid email address", () => {
    expect(validateEstimateRequesterContact({})).toEqual({
      ok: false,
      error: "estimate_requester_required",
    });
    expect(
      validateEstimateRequesterContact({
        estimateRequesterName: "Request Owner",
        estimateRequesterEmail: "not-email",
      })
    ).toEqual({
      ok: false,
      error: "estimate_requester_email_invalid",
    });
    expect(
      validateEstimateRequesterContact({
        estimateRequesterName: " Request Owner ",
        estimateRequesterEmail: " requester@example.com ",
      })
    ).toEqual({
      ok: true,
      contact: {
        name: "Request Owner",
        email: "requester@example.com",
      },
    });
  });
});
