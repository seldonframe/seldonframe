// Tests for TestModeConfigSchema (per-provider test credentials).
// SLICE 8 C1 per audit §3.2 + gates G-8-1, G-8-3, G-8-4.
//
// Cross-ref edges enumerated per audit §3.2 + L-17 control datapoint:
//   1. test.accountSid format refine (Twilio test SID prefix)
//   2. test.authToken non-empty refine
//   3. test.fromNumber E.164 refine
//   4. test.apiKey format refine (Resend test key prefix)
//   5. test.fromEmail email refine
//   6. (top-level superRefine) when present, both twilio.test sub-fields
//      must be all-or-nothing — partial config is rejected
//
// Total: 5-6 edges, single gate (test-credential validity).
//
// Per L-17 hypothesis (4-datapoint settled gate-breadth formula):
//   expected = base(5-6 edges) × gate_breadth(1 gate)
//            = 2.85 × 1.0 = 2.5-3.0x test/prod ratio
// SLICE 8 close-out validates the actual.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  TwilioTestConfigSchema,
  ResendTestConfigSchema,
  TestModeConfigSchema,
} from "../../src/lib/test-mode/schema";

// ---------------------------------------------------------------------
// 1. TwilioTestConfigSchema — happy path
// ---------------------------------------------------------------------

describe("TwilioTestConfigSchema — happy path", () => {
  test("accepts valid Twilio test config", () => {
    const result = TwilioTestConfigSchema.safeParse({
      accountSid: "ACFAKEnotARealTestSID",
      authToken: "test_auth_token_xyz",
      fromNumber: "+15005550006",
    });
    assert.equal(result.success, true);
  });
});

// ---------------------------------------------------------------------
// 2. TwilioTestConfigSchema — accountSid format (cross-ref edge 1)
// ---------------------------------------------------------------------

describe("TwilioTestConfigSchema — accountSid format", () => {
  test("rejects accountSid not starting with AC", () => {
    const result = TwilioTestConfigSchema.safeParse({
      accountSid: "BCtest1234567890abcdef1234567890ab",
      authToken: "test_auth_token_xyz",
      fromNumber: "+15005550006",
    });
    assert.equal(result.success, false);
  });

  test("rejects empty accountSid", () => {
    const result = TwilioTestConfigSchema.safeParse({
      accountSid: "",
      authToken: "test_auth_token_xyz",
      fromNumber: "+15005550006",
    });
    assert.equal(result.success, false);
  });

  test("accepts AC-prefixed accountSid", () => {
    const result = TwilioTestConfigSchema.safeParse({
      accountSid: "ACFAKEnotARealValidSID",
      authToken: "tok",
      fromNumber: "+15005550006",
    });
    assert.equal(result.success, true);
  });
});

// ---------------------------------------------------------------------
// 3. TwilioTestConfigSchema — authToken non-empty (cross-ref edge 2)
// ---------------------------------------------------------------------

describe("TwilioTestConfigSchema — authToken non-empty", () => {
  test("rejects empty authToken", () => {
    const result = TwilioTestConfigSchema.safeParse({
      accountSid: "ACFAKEnotARealTestSID",
      authToken: "",
      fromNumber: "+15005550006",
    });
    assert.equal(result.success, false);
  });

  test("rejects missing authToken", () => {
    const result = TwilioTestConfigSchema.safeParse({
      accountSid: "ACFAKEnotARealTestSID",
      fromNumber: "+15005550006",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------
// 4. TwilioTestConfigSchema — fromNumber E.164 (cross-ref edge 3)
// ---------------------------------------------------------------------

describe("TwilioTestConfigSchema — fromNumber E.164", () => {
  test("accepts Twilio magic test number +15005550006", () => {
    const result = TwilioTestConfigSchema.safeParse({
      accountSid: "ACFAKEnotARealTestSID",
      authToken: "tok",
      fromNumber: "+15005550006",
    });
    assert.equal(result.success, true);
  });

  test("accepts other Twilio magic numbers (+15005550009)", () => {
    const result = TwilioTestConfigSchema.safeParse({
      accountSid: "ACFAKEnotARealTestSID",
      authToken: "tok",
      fromNumber: "+15005550009",
    });
    assert.equal(result.success, true);
  });

  test("rejects non-E.164 fromNumber", () => {
    const result = TwilioTestConfigSchema.safeParse({
      accountSid: "ACFAKEnotARealTestSID",
      authToken: "tok",
      fromNumber: "555-123-4567",
    });
    assert.equal(result.success, false);
  });

  test("rejects fromNumber without leading +", () => {
    const result = TwilioTestConfigSchema.safeParse({
      accountSid: "ACFAKEnotARealTestSID",
      authToken: "tok",
      fromNumber: "15005550006",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------
// 5. ResendTestConfigSchema — apiKey format (cross-ref edge 4)
// ---------------------------------------------------------------------

describe("ResendTestConfigSchema — apiKey format", () => {
  test("accepts re_test-prefixed apiKey", () => {
    const result = ResendTestConfigSchema.safeParse({
      apiKey: "re_test_abcdef123456",
      fromEmail: "test@example.com",
    });
    assert.equal(result.success, true);
  });

  test("rejects re_live-prefixed apiKey (would be production)", () => {
    const result = ResendTestConfigSchema.safeParse({
      apiKey: "re_live_abcdef123456",
      fromEmail: "test@example.com",
    });
    assert.equal(result.success, false);
  });

  test("rejects empty apiKey", () => {
    const result = ResendTestConfigSchema.safeParse({
      apiKey: "",
      fromEmail: "test@example.com",
    });
    assert.equal(result.success, false);
  });

  test("rejects apiKey with no recognizable prefix", () => {
    const result = ResendTestConfigSchema.safeParse({
      apiKey: "not_a_resend_key",
      fromEmail: "test@example.com",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------
// 6. ResendTestConfigSchema — fromEmail email refine (cross-ref edge 5)
// ---------------------------------------------------------------------

describe("ResendTestConfigSchema — fromEmail validation", () => {
  test("accepts test@example.com (Resend recommended test domain)", () => {
    const result = ResendTestConfigSchema.safeParse({
      apiKey: "re_test_abc",
      fromEmail: "test@example.com",
    });
    assert.equal(result.success, true);
  });

  test("rejects malformed email", () => {
    const result = ResendTestConfigSchema.safeParse({
      apiKey: "re_test_abc",
      fromEmail: "not an email",
    });
    assert.equal(result.success, false);
  });

  test("rejects empty fromEmail", () => {
    const result = ResendTestConfigSchema.safeParse({
      apiKey: "re_test_abc",
      fromEmail: "",
    });
    assert.equal(result.success, false);
  });
});

// ---------------------------------------------------------------------
// 7. TestModeConfigSchema — composite (combines twilio + resend optionals)
// ---------------------------------------------------------------------

describe("TestModeConfigSchema — composite shape", () => {
  test("accepts empty object (all providers optional)", () => {
    const result = TestModeConfigSchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("accepts only twilio test config", () => {
    const result = TestModeConfigSchema.safeParse({
      twilio: {
        accountSid: "ACFAKEnotARealTestSID",
        authToken: "tok",
        fromNumber: "+15005550006",
      },
    });
    assert.equal(result.success, true);
  });

  test("accepts only resend test config", () => {
    const result = TestModeConfigSchema.safeParse({
      resend: { apiKey: "re_test_abc", fromEmail: "test@example.com" },
    });
    assert.equal(result.success, true);
  });

  test("accepts both providers", () => {
    const result = TestModeConfigSchema.safeParse({
      twilio: {
        accountSid: "ACFAKEnotARealTestSID",
        authToken: "tok",
        fromNumber: "+15005550006",
      },
      resend: { apiKey: "re_test_abc", fromEmail: "test@example.com" },
    });
    assert.equal(result.success, true);
  });

  test("rejects partial twilio config (cross-ref edge 6: all-or-nothing)", () => {
    const result = TestModeConfigSchema.safeParse({
      twilio: {
        accountSid: "ACFAKEnotARealTestSID",
        // missing authToken + fromNumber
      },
    });
    assert.equal(result.success, false);
  });

  test("rejects partial resend config (cross-ref edge 6: all-or-nothing)", () => {
    const result = TestModeConfigSchema.safeParse({
      resend: { apiKey: "re_test_abc" /* missing fromEmail */ },
    });
    assert.equal(result.success, false);
  });
});
