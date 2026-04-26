// Tests for the approval notifier — composes the email + dispatches
// via the workspace's email API. SLICE 10 PR 2 C1 per Max's prompt.
//
// L-22 discipline: notification failure logs + swallows; the approval
// row exists either way (admin can find it via dashboard polling).
// Mirrors the SLICE 9 PR 2 C4 cost-recorder pattern.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { composeApprovalEmail, notifyApprover } from "../../src/lib/workflow/approvals/notifier";

const APPROVAL = {
  id: "00000000-0000-4000-8000-000000000aaa",
  orgId: "00000000-0000-4000-8000-000000000001",
  contextTitle: "Approve outbound SMS to Maria Alvarez",
  contextSummary: "Heat advisory follow-up — 6 vulnerable customers matched.",
  contextPreview: 'Hi Maria — heads up, 110°+ tomorrow. Want a free AC check before it hits? Reply YES.',
  timeoutAt: new Date("2026-04-26T12:00:00Z"),
};

const APPROVER = {
  email: "operator@desertcool.example.com",
  name: "Jordan Reyes",
  userId: "00000000-0000-4000-8000-000000000bbb",
};

const APP_BASE_URL = "https://desertcool.app.seldonframe.com";
const FAKE_MAGIC_TOKEN = "apl_FAKE_TEST_TOKEN_NOT_A_REAL_HMAC_TOKEN";

describe("composeApprovalEmail — admin path (operator/user_id; no magic-link)", () => {
  test("subject includes 'Approval needed' + the context title", () => {
    const email = composeApprovalEmail({
      approval: APPROVAL,
      approver: APPROVER,
      appBaseUrl: APP_BASE_URL,
      magicLinkToken: null,
    });
    assert.match(email.subject, /Approval needed/);
    assert.ok(email.subject.includes(APPROVAL.contextTitle));
  });

  test("body includes approver name + summary + preview", () => {
    const email = composeApprovalEmail({
      approval: APPROVAL,
      approver: APPROVER,
      appBaseUrl: APP_BASE_URL,
      magicLinkToken: null,
    });
    assert.ok(email.body.includes(APPROVER.name));
    assert.ok(email.body.includes(APPROVAL.contextSummary));
    assert.ok(email.body.includes(APPROVAL.contextPreview ?? ""));
  });

  test("body links to the admin run page (NOT magic-link surface)", () => {
    const email = composeApprovalEmail({
      approval: APPROVAL,
      approver: APPROVER,
      appBaseUrl: APP_BASE_URL,
      magicLinkToken: null,
    });
    // Admin path: link goes to /agents/runs (the drawer surface).
    assert.ok(email.body.includes(`${APP_BASE_URL}/agents/runs`), `expected admin link, got: ${email.body}`);
    // No magic-link path in admin email.
    assert.ok(!email.body.includes("/portal/approvals/"), "admin email must not contain /portal/approvals link");
  });

  test("body includes timeout notice when timeoutAt set", () => {
    const email = composeApprovalEmail({
      approval: APPROVAL,
      approver: APPROVER,
      appBaseUrl: APP_BASE_URL,
      magicLinkToken: null,
    });
    assert.match(email.body, /expires|timeout|by/i);
  });

  test("body omits timeout notice when timeoutAt is null (wait_indefinitely)", () => {
    const email = composeApprovalEmail({
      approval: { ...APPROVAL, timeoutAt: null },
      approver: APPROVER,
      appBaseUrl: APP_BASE_URL,
      magicLinkToken: null,
    });
    assert.ok(!/expires at|expires on/i.test(email.body));
  });
});

describe("composeApprovalEmail — client_owner path (magic-link)", () => {
  test("body links to /portal/approvals/[token] (NOT admin path)", () => {
    const email = composeApprovalEmail({
      approval: APPROVAL,
      approver: APPROVER,
      appBaseUrl: APP_BASE_URL,
      magicLinkToken: FAKE_MAGIC_TOKEN,
    });
    assert.ok(
      email.body.includes(`${APP_BASE_URL}/portal/approvals/${FAKE_MAGIC_TOKEN}`),
      `expected magic-link, got: ${email.body}`,
    );
    // Magic-link path: no admin link in client-facing email (clients
    // don't have admin access).
    assert.ok(!email.body.includes("/agents/runs"), "client-owner email must not contain /agents/runs link");
  });

  test("subject reads professionally for client recipient", () => {
    // The client may not know what "approval needed" means in agency
    // context; subject should be friendly + informative without
    // jargon.
    const email = composeApprovalEmail({
      approval: APPROVAL,
      approver: APPROVER,
      appBaseUrl: APP_BASE_URL,
      magicLinkToken: FAKE_MAGIC_TOKEN,
    });
    assert.ok(email.subject.length > 0);
    assert.ok(email.subject.length < 100, `subject too long: ${email.subject.length}`);
  });
});

describe("notifyApprover — dispatch + failure swallow (L-22)", () => {
  test("happy path: invokes sendEmail, returns delivered=true", async () => {
    let sendCalledWith: { toEmail: string; subject: string; body: string } | null = null as { toEmail: string; subject: string; body: string } | null;
    const ctx = {
      sendEmail: async (params: {
        orgId: string;
        userId: string;
        contactId: string | null;
        toEmail: string;
        subject: string;
        body: string;
      }) => {
        sendCalledWith = { toEmail: params.toEmail, subject: params.subject, body: params.body };
        return { emailId: "em_test_1", contactId: null, suppressed: false as const };
      },
    };
    const result = await notifyApprover(
      {
        approval: APPROVAL,
        approver: APPROVER,
        appBaseUrl: APP_BASE_URL,
        magicLinkToken: null,
      },
      ctx,
    );
    assert.equal(result.delivered, true);
    assert.ok(sendCalledWith);
    assert.equal(sendCalledWith!.toEmail, APPROVER.email);
  });

  test("suppressed recipient: returns delivered=false with reason", async () => {
    const ctx = {
      sendEmail: async () => ({ emailId: null, contactId: null, suppressed: true as const, reason: "bounced" }),
    };
    const result = await notifyApprover(
      { approval: APPROVAL, approver: APPROVER, appBaseUrl: APP_BASE_URL, magicLinkToken: null },
      ctx,
    );
    assert.equal(result.delivered, false);
    assert.equal(result.reason, "bounced");
  });

  test("send-throw: caught + returned as delivered=false (NEVER throws)", async () => {
    const ctx = {
      sendEmail: async () => {
        throw new Error("Resend API down");
      },
    };
    let warned = false;
    const originalWarn = console.warn;
    console.warn = () => {
      warned = true;
    };
    try {
      const result = await notifyApprover(
        { approval: APPROVAL, approver: APPROVER, appBaseUrl: APP_BASE_URL, magicLinkToken: null },
        ctx,
      );
      assert.equal(result.delivered, false);
      assert.match(result.reason ?? "", /Resend API down|exception/i);
      assert.ok(warned, "expected console.warn on swallow");
    } finally {
      console.warn = originalWarn;
    }
  });
});
