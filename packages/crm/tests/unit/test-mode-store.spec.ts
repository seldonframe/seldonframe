// Tests for the workspace test-mode persistence helpers.
// SLICE 8 C2 per audit + gates G-8-1, G-8-4, G-8-7.
//
// Storage contract:
//   - loadWorkspaceTestMode(orgId) → { enabled, twilio?, resend? }
//   - setWorkspaceTestMode(orgId, enabled) — toggles top-level flag
//   - setWorkspaceTestConfig(orgId, "twilio" | "resend", config) — sets
//     per-provider test creds (validated against TestModeConfigSchema)
//   - clearWorkspaceTestConfig(orgId, "twilio" | "resend") — removes test sub
//
// Tests use the in-memory store. Drizzle adapter typechecks against
// production surface; integration verified via E2E in C7.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  makeInMemoryWorkspaceTestModeStore,
  type WorkspaceTestModeStore,
} from "../../src/lib/test-mode/store";

const ORG = "org_acme";
const VALID_TWILIO = {
  accountSid: "ACFAKEnotARealTestSID",
  authToken: "tok",
  fromNumber: "+15005550006",
};
const VALID_RESEND = {
  apiKey: "re_test_abc123",
  fromEmail: "test@example.com",
};

function seeded(): WorkspaceTestModeStore {
  const store = makeInMemoryWorkspaceTestModeStore();
  store._seed(ORG, { enabled: false });
  return store;
}

// ---------------------------------------------------------------------
// 1. loadWorkspaceTestMode — defaults
// ---------------------------------------------------------------------

describe("loadWorkspaceTestMode — defaults", () => {
  test("returns enabled=false for unseeded org", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    const state = await store.loadWorkspaceTestMode("unknown_org");
    assert.equal(state.enabled, false);
    assert.equal(state.twilio, undefined);
    assert.equal(state.resend, undefined);
  });

  test("returns persisted state for seeded org", async () => {
    const store = seeded();
    const state = await store.loadWorkspaceTestMode(ORG);
    assert.equal(state.enabled, false);
  });
});

// ---------------------------------------------------------------------
// 2. setWorkspaceTestMode — toggle flag
// ---------------------------------------------------------------------

describe("setWorkspaceTestMode — toggle", () => {
  test("toggles flag from false → true", async () => {
    const store = seeded();
    await store.setWorkspaceTestMode(ORG, true);
    const state = await store.loadWorkspaceTestMode(ORG);
    assert.equal(state.enabled, true);
  });

  test("toggles flag from true → false", async () => {
    const store = seeded();
    await store.setWorkspaceTestMode(ORG, true);
    await store.setWorkspaceTestMode(ORG, false);
    const state = await store.loadWorkspaceTestMode(ORG);
    assert.equal(state.enabled, false);
  });

  test("idempotent — setting same value twice is safe", async () => {
    const store = seeded();
    await store.setWorkspaceTestMode(ORG, true);
    await store.setWorkspaceTestMode(ORG, true);
    const state = await store.loadWorkspaceTestMode(ORG);
    assert.equal(state.enabled, true);
  });
});

// ---------------------------------------------------------------------
// 3. setWorkspaceTestConfig — per-provider write + validation
// ---------------------------------------------------------------------

describe("setWorkspaceTestConfig — Twilio", () => {
  test("sets valid twilio test config", async () => {
    const store = seeded();
    await store.setWorkspaceTestConfig(ORG, "twilio", VALID_TWILIO);
    const state = await store.loadWorkspaceTestMode(ORG);
    assert.deepEqual(state.twilio, VALID_TWILIO);
  });

  test("rejects invalid twilio test config (bad accountSid prefix)", async () => {
    const store = seeded();
    await assert.rejects(
      () => store.setWorkspaceTestConfig(ORG, "twilio", {
        accountSid: "BCnotvalid",
        authToken: "tok",
        fromNumber: "+15005550006",
      } as never),
      /accountSid|prefix|Twilio/i,
    );
  });

  test("rejects partial twilio test config (missing fromNumber)", async () => {
    const store = seeded();
    await assert.rejects(
      () => store.setWorkspaceTestConfig(ORG, "twilio", {
        accountSid: "ACvalid",
        authToken: "tok",
      } as never),
    );
  });
});

describe("setWorkspaceTestConfig — Resend", () => {
  test("sets valid resend test config", async () => {
    const store = seeded();
    await store.setWorkspaceTestConfig(ORG, "resend", VALID_RESEND);
    const state = await store.loadWorkspaceTestMode(ORG);
    assert.deepEqual(state.resend, VALID_RESEND);
  });

  test("rejects invalid resend test config (re_live prefix)", async () => {
    const store = seeded();
    await assert.rejects(
      () => store.setWorkspaceTestConfig(ORG, "resend", {
        apiKey: "re_live_oops",
        fromEmail: "test@example.com",
      } as never),
      /apiKey|prefix|test/i,
    );
  });
});

// ---------------------------------------------------------------------
// 4. clearWorkspaceTestConfig — per-provider remove
// ---------------------------------------------------------------------

describe("clearWorkspaceTestConfig", () => {
  test("removes twilio test config, leaves resend untouched", async () => {
    const store = seeded();
    await store.setWorkspaceTestConfig(ORG, "twilio", VALID_TWILIO);
    await store.setWorkspaceTestConfig(ORG, "resend", VALID_RESEND);
    await store.clearWorkspaceTestConfig(ORG, "twilio");
    const state = await store.loadWorkspaceTestMode(ORG);
    assert.equal(state.twilio, undefined);
    assert.deepEqual(state.resend, VALID_RESEND);
  });

  test("clearing already-empty config is safe (idempotent)", async () => {
    const store = seeded();
    await store.clearWorkspaceTestConfig(ORG, "twilio");
    const state = await store.loadWorkspaceTestMode(ORG);
    assert.equal(state.twilio, undefined);
  });
});

// ---------------------------------------------------------------------
// 5. Cross-org isolation
// ---------------------------------------------------------------------

describe("WorkspaceTestModeStore — cross-org isolation", () => {
  test("setting org_a's test mode does not affect org_b", async () => {
    const store = makeInMemoryWorkspaceTestModeStore();
    store._seed("org_a", { enabled: false });
    store._seed("org_b", { enabled: false });
    await store.setWorkspaceTestMode("org_a", true);
    const a = await store.loadWorkspaceTestMode("org_a");
    const b = await store.loadWorkspaceTestMode("org_b");
    assert.equal(a.enabled, true);
    assert.equal(b.enabled, false);
  });
});
