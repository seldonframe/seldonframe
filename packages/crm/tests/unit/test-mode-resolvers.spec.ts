// Tests for per-provider test-mode resolvers.
// SLICE 8 C3 per audit §4.1 + gates G-8-4 (fail-fast), G-8-7 (read at dispatch).
//
// Two independent resolvers (orthogonal — no policy interleaving):
//   - resolveTwilioConfig(orgId, store) → live or test config
//   - resolveResendConfig(orgId, store) → live or test config
//
// Per L-17 hypothesis (2-datapoint dispatcher interleaving):
//   - SLICE 5 schedule dispatcher (interleaved): 3.5x
//   - SLICE 7 message dispatcher (orthogonal):   1.75x
//   - SLICE 8 resolvers (orthogonal):            predicted 1.5-2.0x
// SLICE 8 close-out documents the actual; if 1.5-2.0x, hypothesis
// promotes from 2-datapoint to 3-datapoint settled rule.
//
// Each resolver:
//   1. loads workspace test mode state via store
//   2. if testMode=false → returns live config
//   3. if testMode=true AND test config present → returns test config
//   4. if testMode=true AND test config missing → throws TestModeMissingConfigError

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveTwilioConfig,
  resolveResendConfig,
  TestModeMissingConfigError,
  type TwilioRuntimeConfig,
  type ResendRuntimeConfig,
} from "../../src/lib/test-mode/resolvers";
import {
  makeInMemoryWorkspaceTestModeStore,
} from "../../src/lib/test-mode/store";

const ORG = "org_acme";

const LIVE_TWILIO: TwilioRuntimeConfig = {
  accountSid: "ACFAKEnotARealLiveSID",
  authToken: "live_token",
  fromNumber: "+15551112222",
};
const TEST_TWILIO = {
  accountSid: "ACFAKEnotARealTestSID",
  authToken: "test_token",
  fromNumber: "+15005550006",
};
const LIVE_RESEND: ResendRuntimeConfig = {
  apiKey: "re_live_key",
  fromEmail: "hi@brand.com",
  fromName: "Brand",
};
const TEST_RESEND = {
  apiKey: "re_test_key",
  fromEmail: "test@example.com",
};

// ---------------------------------------------------------------------
// 1. resolveTwilioConfig — live mode (testMode=false)
// ---------------------------------------------------------------------

describe("resolveTwilioConfig — live mode", () => {
  test("returns live config when testMode=false", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: false });
    const config = await resolveTwilioConfig({
      orgId: ORG,
      liveConfig: LIVE_TWILIO,
      store,
    });
    assert.deepEqual(config, { ...LIVE_TWILIO, mode: "live" });
  });

  test("returns live config when testMode=false even if test creds set", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: false });
    await store.setWorkspaceTestConfig(ORG, "twilio", TEST_TWILIO);
    const config = await resolveTwilioConfig({
      orgId: ORG,
      liveConfig: LIVE_TWILIO,
      store,
    });
    assert.equal(config.mode, "live");
    assert.equal(config.fromNumber, LIVE_TWILIO.fromNumber);
  });
});

// ---------------------------------------------------------------------
// 2. resolveTwilioConfig — test mode (testMode=true) with creds
// ---------------------------------------------------------------------

describe("resolveTwilioConfig — test mode with creds", () => {
  test("returns test config when testMode=true and creds present", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    await store.setWorkspaceTestConfig(ORG, "twilio", TEST_TWILIO);
    const config = await resolveTwilioConfig({
      orgId: ORG,
      liveConfig: LIVE_TWILIO,
      store,
    });
    assert.equal(config.mode, "test");
    assert.equal(config.fromNumber, TEST_TWILIO.fromNumber);
    assert.equal(config.accountSid, TEST_TWILIO.accountSid);
  });
});

// ---------------------------------------------------------------------
// 3. resolveTwilioConfig — fail-fast on missing test creds (G-8-4)
// ---------------------------------------------------------------------

describe("resolveTwilioConfig — fail-fast on missing test creds", () => {
  test("throws TestModeMissingConfigError when testMode=true but test config missing", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    // No test config set
    await assert.rejects(
      () => resolveTwilioConfig({ orgId: ORG, liveConfig: LIVE_TWILIO, store }),
      TestModeMissingConfigError,
    );
  });

  test("error message names the missing provider", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    try {
      await resolveTwilioConfig({ orgId: ORG, liveConfig: LIVE_TWILIO, store });
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof TestModeMissingConfigError);
      assert.match(err.message, /twilio/i);
      assert.match(err.message, /test mode active/i);
      assert.equal(err.provider, "twilio");
    }
  });
});

// ---------------------------------------------------------------------
// 4. resolveResendConfig — live mode
// ---------------------------------------------------------------------

describe("resolveResendConfig — live mode", () => {
  test("returns live config when testMode=false", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: false });
    const config = await resolveResendConfig({
      orgId: ORG,
      liveConfig: LIVE_RESEND,
      store,
    });
    assert.equal(config.mode, "live");
    assert.equal(config.apiKey, LIVE_RESEND.apiKey);
    assert.equal(config.fromEmail, LIVE_RESEND.fromEmail);
  });
});

// ---------------------------------------------------------------------
// 5. resolveResendConfig — test mode with creds
// ---------------------------------------------------------------------

describe("resolveResendConfig — test mode with creds", () => {
  test("returns test config when testMode=true and creds present", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    await store.setWorkspaceTestConfig(ORG, "resend", TEST_RESEND);
    const config = await resolveResendConfig({
      orgId: ORG,
      liveConfig: LIVE_RESEND,
      store,
    });
    assert.equal(config.mode, "test");
    assert.equal(config.apiKey, TEST_RESEND.apiKey);
    assert.equal(config.fromEmail, TEST_RESEND.fromEmail);
  });

  test("test config inherits fromName from live config (test schema doesn't include it)", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    await store.setWorkspaceTestConfig(ORG, "resend", TEST_RESEND);
    const config = await resolveResendConfig({
      orgId: ORG,
      liveConfig: LIVE_RESEND,
      store,
    });
    assert.equal(config.fromName, LIVE_RESEND.fromName, "fromName carries over from live");
  });
});

// ---------------------------------------------------------------------
// 6. resolveResendConfig — fail-fast (G-8-4)
// ---------------------------------------------------------------------

describe("resolveResendConfig — fail-fast on missing test creds", () => {
  test("throws TestModeMissingConfigError when testMode=true but test config missing", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    await assert.rejects(
      () => resolveResendConfig({ orgId: ORG, liveConfig: LIVE_RESEND, store }),
      TestModeMissingConfigError,
    );
  });

  test("error message names the missing provider", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    try {
      await resolveResendConfig({ orgId: ORG, liveConfig: LIVE_RESEND, store });
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof TestModeMissingConfigError);
      assert.match(err.message, /resend/i);
      assert.equal(err.provider, "resend");
    }
  });
});

// ---------------------------------------------------------------------
// 7. Cross-provider isolation — Twilio test config doesn't satisfy Resend
// ---------------------------------------------------------------------

describe("Resolvers — cross-provider isolation", () => {
  test("Twilio test config set does not satisfy Resend resolver", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    await store.setWorkspaceTestConfig(ORG, "twilio", TEST_TWILIO);
    // Resend has no test config → must fail
    await assert.rejects(
      () => resolveResendConfig({ orgId: ORG, liveConfig: LIVE_RESEND, store }),
      TestModeMissingConfigError,
    );
  });

  test("Resend test config set does not satisfy Twilio resolver", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    await store.setWorkspaceTestConfig(ORG, "resend", TEST_RESEND);
    await assert.rejects(
      () => resolveTwilioConfig({ orgId: ORG, liveConfig: LIVE_TWILIO, store }),
      TestModeMissingConfigError,
    );
  });
});
