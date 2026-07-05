// packages/crm/tests/unit/telephony/has-live-sms.spec.ts
// TDD — regression guard for the inbox SMS-gate defect (review-flagged,
// commit 6e5a31bb0): "SMS is live" must NOT require voiceTrunkSid. Only
// the SMS provider's own bar (accountSid + authToken + fromNumber) counts,
// matching lib/sms/providers/twilio.ts:isConfigured exactly.
// Run: ( cd packages/crm && node --import tsx --test tests/unit/telephony/has-live-sms.spec.ts )

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { hasLiveSms } from "../../../src/lib/telephony/config";

describe("hasLiveSms", () => {
  test("accountSid + authToken + fromNumber present, NO voiceTrunkSid -> true (SMS-only common case)", () => {
    const integrations = {
      twilio: {
        accountSid: "ACabc123",
        authToken: "v1.encryptedtoken",
        fromNumber: "+15551234567",
        // voiceTrunkSid intentionally absent
      },
    };
    assert.equal(hasLiveSms(integrations), true);
  });

  test("missing fromNumber -> false", () => {
    const integrations = {
      twilio: {
        accountSid: "ACabc123",
        authToken: "v1.encryptedtoken",
      },
    };
    assert.equal(hasLiveSms(integrations), false);
  });

  test("missing authToken -> false", () => {
    const integrations = {
      twilio: {
        accountSid: "ACabc123",
        fromNumber: "+15551234567",
      },
    };
    assert.equal(hasLiveSms(integrations), false);
  });

  test("voiceTrunkSid also present -> still true (trunk irrelevant to SMS-live)", () => {
    const integrations = {
      twilio: {
        accountSid: "ACabc123",
        authToken: "v1.encryptedtoken",
        fromNumber: "+15551234567",
        voiceTrunkSid: "TKtrunk001",
      },
    };
    assert.equal(hasLiveSms(integrations), true);
  });

  test("null/empty integrations -> false", () => {
    assert.equal(hasLiveSms(null), false);
    assert.equal(hasLiveSms(undefined), false);
    assert.equal(hasLiveSms({}), false);
  });
});
