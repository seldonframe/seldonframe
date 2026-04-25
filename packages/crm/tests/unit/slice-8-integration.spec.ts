// SLICE 8 integration test — workspace test mode end-to-end.
// SLICE 8 C7 per audit §11 + spec scope.
//
// Verifies the full pipeline at the resolver+store boundary:
//   1. Workspace toggles test mode → resolver returns test config
//   2. Test mode + missing creds → fail-fast with TestModeMissingConfigError
//   3. Cross-provider isolation (twilio test config doesn't satisfy resend)
//   4. Live mode unchanged when test creds present but flag off
//   5. Round-trip: enable → set creds → resolve → clear → resolve fails
//
// "Shallow-plus": exercises the resolver + store integration via
// the in-memory store. Production Drizzle adapter is verified via
// preview deploys.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveTwilioConfig,
  resolveResendConfig,
  TestModeMissingConfigError,
} from "../../src/lib/test-mode/resolvers";
import { makeInMemoryWorkspaceTestModeStore } from "../../src/lib/test-mode/store";

const ORG = "org_clinic";

// Fixtures use format-breaking SIDs per L-28 to avoid GitHub Secret
// Scanner false positives on the Twilio AC + hex pattern.

const LIVE_TWILIO = {
  accountSid: "ACFAKEnotARealLiveSID",
  authToken: "live_token",
  fromNumber: "+15551112222",
};
const TEST_TWILIO = {
  accountSid: "ACFAKEnotARealTestSID",
  authToken: "test_token",
  fromNumber: "+15005550006",
};
const LIVE_RESEND = {
  apiKey: "re_live_xyz",
  fromEmail: "hi@brand.com",
  fromName: "Brand",
};
const TEST_RESEND = {
  apiKey: "re_test_abc123",
  fromEmail: "test@example.com",
};

// ---------------------------------------------------------------------
// 1. End-to-end happy path: enable test mode → set creds → dispatch routes test
// ---------------------------------------------------------------------

describe("SLICE 8 E2E — happy path", () => {
  test("enabling test mode + setting Twilio test creds → resolver returns test config", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: false });

    // Initially live
    let resolved = await resolveTwilioConfig({
      orgId: ORG,
      liveConfig: LIVE_TWILIO,
      store,
    });
    assert.equal(resolved.mode, "live");
    assert.equal(resolved.fromNumber, LIVE_TWILIO.fromNumber);

    // Builder sets test creds + enables test mode
    await store.setWorkspaceTestConfig(ORG, "twilio", TEST_TWILIO);
    await store.setWorkspaceTestMode(ORG, true);

    // Now routes to test
    resolved = await resolveTwilioConfig({
      orgId: ORG,
      liveConfig: LIVE_TWILIO,
      store,
    });
    assert.equal(resolved.mode, "test");
    assert.equal(resolved.fromNumber, TEST_TWILIO.fromNumber);
    assert.equal(resolved.accountSid, TEST_TWILIO.accountSid);
  });

  test("enabling test mode + setting Resend test creds → resolver returns test config (with live fromName)", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: false });
    await store.setWorkspaceTestConfig(ORG, "resend", TEST_RESEND);
    await store.setWorkspaceTestMode(ORG, true);

    const resolved = await resolveResendConfig({
      orgId: ORG,
      liveConfig: LIVE_RESEND,
      store,
    });
    assert.equal(resolved.mode, "test");
    assert.equal(resolved.apiKey, TEST_RESEND.apiKey);
    assert.equal(resolved.fromEmail, TEST_RESEND.fromEmail);
    // fromName carries from live config (test schema doesn't include it)
    assert.equal(resolved.fromName, LIVE_RESEND.fromName);
  });
});

// ---------------------------------------------------------------------
// 2. Fail-fast (G-8-4) — test mode on with missing creds
// ---------------------------------------------------------------------

describe("SLICE 8 E2E — fail-fast on missing test creds", () => {
  test("test mode on, no Twilio test creds → TestModeMissingConfigError", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    await assert.rejects(
      () => resolveTwilioConfig({ orgId: ORG, liveConfig: LIVE_TWILIO, store }),
      TestModeMissingConfigError,
    );
  });

  test("test mode on, no Resend test creds → TestModeMissingConfigError", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    await assert.rejects(
      () => resolveResendConfig({ orgId: ORG, liveConfig: LIVE_RESEND, store }),
      TestModeMissingConfigError,
    );
  });

  test("error message names the missing provider + actionable guidance", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    try {
      await resolveTwilioConfig({ orgId: ORG, liveConfig: LIVE_TWILIO, store });
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof TestModeMissingConfigError);
      assert.match(err.message, /Configure test credentials/i);
      assert.match(err.message, /workspace settings/i);
    }
  });
});

// ---------------------------------------------------------------------
// 3. Cross-provider isolation (G-8-7 reads at dispatch boundary, per-provider)
// ---------------------------------------------------------------------

describe("SLICE 8 E2E — cross-provider isolation", () => {
  test("test mode on, Twilio creds set, Resend creds missing → Twilio routes test, Resend fails", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: true });
    await store.setWorkspaceTestConfig(ORG, "twilio", TEST_TWILIO);

    const twilio = await resolveTwilioConfig({
      orgId: ORG,
      liveConfig: LIVE_TWILIO,
      store,
    });
    assert.equal(twilio.mode, "test");

    await assert.rejects(
      () => resolveResendConfig({ orgId: ORG, liveConfig: LIVE_RESEND, store }),
      TestModeMissingConfigError,
    );
  });
});

// ---------------------------------------------------------------------
// 4. Test creds present but flag off → live mode (creds dormant)
// ---------------------------------------------------------------------

describe("SLICE 8 E2E — test creds dormant when flag off", () => {
  test("test creds set but testMode=false → resolver returns live config", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: false });
    await store.setWorkspaceTestConfig(ORG, "twilio", TEST_TWILIO);
    await store.setWorkspaceTestConfig(ORG, "resend", TEST_RESEND);

    const twilio = await resolveTwilioConfig({
      orgId: ORG,
      liveConfig: LIVE_TWILIO,
      store,
    });
    const resend = await resolveResendConfig({
      orgId: ORG,
      liveConfig: LIVE_RESEND,
      store,
    });

    assert.equal(twilio.mode, "live");
    assert.equal(twilio.fromNumber, LIVE_TWILIO.fromNumber);
    assert.equal(resend.mode, "live");
    assert.equal(resend.apiKey, LIVE_RESEND.apiKey);
  });
});

// ---------------------------------------------------------------------
// 5. Round-trip — enable → set → resolve → clear → resolve fails
// ---------------------------------------------------------------------

describe("SLICE 8 E2E — round-trip lifecycle", () => {
  test("enable → set creds → resolve test → clear → resolve fails fast", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed(ORG, { enabled: false });

    await store.setWorkspaceTestConfig(ORG, "twilio", TEST_TWILIO);
    await store.setWorkspaceTestMode(ORG, true);

    let resolved = await resolveTwilioConfig({
      orgId: ORG,
      liveConfig: LIVE_TWILIO,
      store,
    });
    assert.equal(resolved.mode, "test");

    // Builder removes test creds (e.g., to reconfigure)
    await store.clearWorkspaceTestConfig(ORG, "twilio");

    // Test mode is still on but creds are gone → fail-fast
    await assert.rejects(
      () => resolveTwilioConfig({ orgId: ORG, liveConfig: LIVE_TWILIO, store }),
      TestModeMissingConfigError,
    );

    // Builder disables test mode → live again
    await store.setWorkspaceTestMode(ORG, false);
    resolved = await resolveTwilioConfig({
      orgId: ORG,
      liveConfig: LIVE_TWILIO,
      store,
    });
    assert.equal(resolved.mode, "live");
  });
});

// ---------------------------------------------------------------------
// 6. Cross-org isolation (test mode on org_a does not affect org_b)
// ---------------------------------------------------------------------

describe("SLICE 8 E2E — cross-org isolation", () => {
  test("org_a in test mode, org_b in live mode → resolvers respect each", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed("org_a", { enabled: true });
    await store.setWorkspaceTestConfig("org_a", "twilio", TEST_TWILIO);
    store._seed("org_b", { enabled: false });

    const a = await resolveTwilioConfig({
      orgId: "org_a",
      liveConfig: LIVE_TWILIO,
      store,
    });
    const b = await resolveTwilioConfig({
      orgId: "org_b",
      liveConfig: LIVE_TWILIO,
      store,
    });

    assert.equal(a.mode, "test");
    assert.equal(b.mode, "live");
  });
});
