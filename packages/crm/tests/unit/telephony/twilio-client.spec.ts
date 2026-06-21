// packages/crm/tests/unit/telephony/twilio-client.spec.ts
//
// Smoke test: createTwilioTelephonyClient returns the four required methods.
// The real fetch client is the network seam — it is not unit-tested against
// a live endpoint. The state machine fakes the whole TwilioTelephonyClient
// interface and is tested in provision-voice-number.spec.ts.
//
// Run: ( cd packages/crm && node --import tsx --test tests/unit/telephony/twilio-client.spec.ts )

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { createTwilioTelephonyClient } from "../../../src/lib/telephony/twilio-client";

describe("createTwilioTelephonyClient", () => {
  test("returns an object with the four required methods", () => {
    const client = createTwilioTelephonyClient({
      accountSid: "ACtest",
      authToken: "tokentest",
    });

    assert.strictEqual(typeof client.searchLocalVoiceNumbers, "function");
    assert.strictEqual(typeof client.buyNumber, "function");
    assert.strictEqual(typeof client.attachNumberToTrunk, "function");
    assert.strictEqual(typeof client.releaseNumber, "function");
  });
});
