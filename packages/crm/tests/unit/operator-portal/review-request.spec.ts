// tests/unit/operator-portal/review-request.spec.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sendReviewRequest, type ReviewRequestDeps } from "../../../src/lib/operator-portal/review-request";

const baseInput = {
  orgId: "org-1",
  contactId: "contact-1",
  toEmail: "jane@example.com",
  toPhone: "+15550001234",
  contactName: "Jane Doe",
  reviewLink: "https://g.page/r/example-review",
};

describe("sendReviewRequest", () => {
  test("always sends email", async () => {
    let emailSent = false;
    const deps: ReviewRequestDeps = {
      sendEmail: async (_params) => { emailSent = true; return { emailId: "e1", suppressed: false }; },
      sendSms: async (_params) => { throw new Error("should not be called"); },
      getOutboundSmsEnabled: async (_orgId) => false,
    };
    const result = await sendReviewRequest(baseInput, deps);
    assert.equal(emailSent, true);
    assert.equal(result.emailSent, true);
    assert.equal(result.smsSent, false);
  });

  test("does NOT send SMS when outboundSmsEnabled=false", async () => {
    let smsCalled = false;
    const deps: ReviewRequestDeps = {
      sendEmail: async (_params) => ({ emailId: "e1", suppressed: false }),
      sendSms: async (_params) => { smsCalled = true; return { smsId: "s1", contactId: null, suppressed: false, externalMessageId: "ext", segments: 1 }; },
      getOutboundSmsEnabled: async (_orgId) => false,
    };
    const result = await sendReviewRequest(baseInput, deps);
    assert.equal(smsCalled, false);
    assert.equal(result.smsSent, false);
  });

  test("sends SMS when outboundSmsEnabled=true and toPhone is set", async () => {
    let smsCalled = false;
    const deps: ReviewRequestDeps = {
      sendEmail: async (_params) => ({ emailId: "e1", suppressed: false }),
      sendSms: async (_params) => { smsCalled = true; return { smsId: "s1", contactId: null, suppressed: false, externalMessageId: "ext", segments: 1 }; },
      getOutboundSmsEnabled: async (_orgId) => true,
    };
    const result = await sendReviewRequest(baseInput, deps);
    assert.equal(smsCalled, true);
    assert.equal(result.smsSent, true);
  });

  test("does NOT send SMS when toPhone is empty even if enabled", async () => {
    let smsCalled = false;
    const deps: ReviewRequestDeps = {
      sendEmail: async (_params) => ({ emailId: "e1", suppressed: false }),
      sendSms: async (_params) => { smsCalled = true; return { smsId: "s1", contactId: null, suppressed: false, externalMessageId: "ext", segments: 1 }; },
      getOutboundSmsEnabled: async (_orgId) => true,
    };
    const result = await sendReviewRequest({ ...baseInput, toPhone: "" }, deps);
    assert.equal(smsCalled, false);
    assert.equal(result.smsSent, false);
  });

  test("returns emailSuppressed=true when email provider suppresses", async () => {
    const deps: ReviewRequestDeps = {
      sendEmail: async (_params) => ({ emailId: null, suppressed: true, reason: "bounced" }),
      sendSms: async (_params) => { throw new Error("should not be called"); },
      getOutboundSmsEnabled: async (_orgId) => false,
    };
    const result = await sendReviewRequest(baseInput, deps);
    assert.equal(result.emailSent, false);
    assert.equal(result.emailSuppressed, true);
  });
});
