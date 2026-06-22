// Multi-surface runtime — tests for the concrete channel adapters.
//
// The adapters are send-only and the send fn is DI'd, so we assert the exact
// params each adapter forwards to sendSmsFromApi / sendEmailFromApi WITHOUT
// touching Twilio / Resend / Neon. Crucially: the reply goes back to the SENDER
// (target.fromHandle), from the RESOLVED org (target.orgId) — for a deployment
// number that's the client org, so a deployment-SMS reply is sent from the
// client workspace's Twilio number.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  createTwilioSmsAdapter,
  createResendEmailAdapter,
  deriveReplySubject,
  type ChannelReplyTarget,
} from "../../../../src/lib/agents/channels/channel-adapter";

const SMS_TARGET: ChannelReplyTarget = {
  fromHandle: "+15125559999", // the customer
  toHandle: "+18335550100", // our provisioned deployment number
  orgId: "client-org-1",
  contactId: "contact-7",
};

describe("createTwilioSmsAdapter", () => {
  test("sends the reply to the sender, from the resolved org, userId null", async () => {
    const calls: unknown[] = [];
    const adapter = createTwilioSmsAdapter({
      sendSms: async (params) => {
        calls.push(params);
        return {
          smsId: "sms-1",
          contactId: params.contactId,
          suppressed: false,
          externalMessageId: "ext-1",
          segments: 1,
        };
      },
    });

    await adapter.sendReply(SMS_TARGET, "Friday 2pm works — want me to book it?");

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      orgId: "client-org-1",
      userId: null,
      contactId: "contact-7",
      toNumber: "+15125559999",
      body: "Friday 2pm works — want me to book it?",
    });
  });

  test("null contactId is forwarded as null", async () => {
    let captured: { contactId: string | null } | null = null;
    const adapter = createTwilioSmsAdapter({
      sendSms: async (params) => {
        captured = { contactId: params.contactId };
        return {
          smsId: "x",
          contactId: params.contactId,
          suppressed: false,
          externalMessageId: "e",
          segments: 1,
        };
      },
    });
    await adapter.sendReply({ ...SMS_TARGET, contactId: undefined }, "hi");
    assert.equal(captured!.contactId, null);
  });
});

describe("createResendEmailAdapter", () => {
  test("replies to the sender from the resolved org with a Re: subject", async () => {
    const calls: unknown[] = [];
    const adapter = createResendEmailAdapter({
      sendEmail: async (params) => {
        calls.push(params);
        return { emailId: "em-1", contactId: params.contactId, suppressed: false };
      },
    });

    await adapter.sendReply(
      {
        fromHandle: "jane@example.com",
        toHandle: "hello@acme.com",
        orgId: "org-acme",
        contactId: "c-9",
        metadata: { subject: "Booking question" },
      },
      "Happy to help — we're open 9–5 weekdays.",
    );

    assert.deepEqual(calls[0], {
      orgId: "org-acme",
      userId: null,
      contactId: "c-9",
      toEmail: "jane@example.com",
      subject: "Re: Booking question",
      body: "Happy to help — we're open 9–5 weekdays.",
    });
  });

  test("missing subject falls back to a generic Re:", async () => {
    let subject = "";
    const adapter = createResendEmailAdapter({
      sendEmail: async (params) => {
        subject = params.subject;
        return { emailId: "x", contactId: null, suppressed: false };
      },
    });
    await adapter.sendReply(
      { fromHandle: "a@b.com", toHandle: "c@d.com", orgId: "o" },
      "hi",
    );
    assert.equal(subject, "Re: your message");
  });
});

describe("deriveReplySubject", () => {
  test("prefixes Re: once, preserves an existing Re:", () => {
    assert.equal(deriveReplySubject("Hours?"), "Re: Hours?");
    assert.equal(deriveReplySubject("Re: Hours?"), "Re: Hours?");
    assert.equal(deriveReplySubject("RE: Hours?"), "RE: Hours?");
    assert.equal(deriveReplySubject(""), "Re: your message");
    assert.equal(deriveReplySubject(undefined), "Re: your message");
    assert.equal(deriveReplySubject(42), "Re: your message");
  });
});
