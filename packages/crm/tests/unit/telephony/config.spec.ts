// packages/crm/tests/unit/telephony/config.spec.ts
// TDD — tests for pickTelephonyFromIntegrations (pure, no DB).
// Run: ( cd packages/crm && node --import tsx --test tests/unit/telephony/config.spec.ts )

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { pickTelephonyFromIntegrations } from "../../../src/lib/telephony/config";

describe("pickTelephonyFromIntegrations", () => {
  test("returns all three fields when full twilio blob is present", () => {
    const integrations = {
      twilio: {
        accountSid: "ACabc123",
        authToken: "v1.encryptedtoken",
        voiceTrunkSid: "TKtrunk001",
      },
    };
    const result = pickTelephonyFromIntegrations(integrations);
    assert.equal(result.accountSid, "ACabc123");
    assert.equal(result.authTokenRaw, "v1.encryptedtoken");
    assert.equal(result.voiceTrunkSid, "TKtrunk001");
  });

  test("returns all null when integrations has no twilio key", () => {
    const result = pickTelephonyFromIntegrations({});
    assert.equal(result.accountSid, null);
    assert.equal(result.authTokenRaw, null);
    assert.equal(result.voiceTrunkSid, null);
  });

  test("returns null for voiceTrunkSid when it is missing but accountSid/authToken are present", () => {
    const integrations = {
      twilio: {
        accountSid: "ACdef456",
        authToken: "v1.anothertoken",
        // voiceTrunkSid absent
      },
    };
    const result = pickTelephonyFromIntegrations(integrations);
    assert.equal(result.accountSid, "ACdef456");
    assert.equal(result.authTokenRaw, "v1.anothertoken");
    assert.equal(result.voiceTrunkSid, null);
  });

  test("returns all null when integrations is null", () => {
    const result = pickTelephonyFromIntegrations(null);
    assert.equal(result.accountSid, null);
    assert.equal(result.authTokenRaw, null);
    assert.equal(result.voiceTrunkSid, null);
  });

  test("returns all null when integrations is undefined", () => {
    const result = pickTelephonyFromIntegrations(undefined);
    assert.equal(result.accountSid, null);
    assert.equal(result.authTokenRaw, null);
    assert.equal(result.voiceTrunkSid, null);
  });

  test("returns null fields when twilio entry has empty strings", () => {
    const integrations = {
      twilio: {
        accountSid: "",
        authToken: "",
        voiceTrunkSid: "",
      },
    };
    const result = pickTelephonyFromIntegrations(integrations);
    // Empty strings should be treated as absent
    assert.equal(result.accountSid, null);
    assert.equal(result.authTokenRaw, null);
    assert.equal(result.voiceTrunkSid, null);
  });
});
