// Tests for makeWorkspaceSecretResolver — production SecretResolver
// factory that queries workspace_secrets + decrypts.
// SLICE 6 PR 2 C3.
//
// Signature:
//   makeWorkspaceSecretResolver({ orgId, db }) → SecretResolver
//
// Runtime:
//   const resolver = makeWorkspaceSecretResolver({ orgId, db })
//   const plaintext = await resolver("my_api_key")
//
// Uses the in-memory-fake DB pattern consistent with other SLICE 6
// tests — production Drizzle integration is verified via the
// end-to-end integration harness (C6) + preview deploys.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  makeWorkspaceSecretResolver,
  type WorkspaceSecretsStore,
} from "../../src/lib/workflow/secret-resolver";

// ---------------------------------------------------------------------
// In-memory store for testing
// ---------------------------------------------------------------------

function makeStore(
  records: Array<{ orgId: string; serviceName: string; plaintext: string }>,
): WorkspaceSecretsStore {
  return {
    async findByOrgAndService({ orgId, serviceName }) {
      const hit = records.find(
        (r) => r.orgId === orgId && r.serviceName === serviceName,
      );
      return hit ? { plaintext: hit.plaintext } : null;
    },
  };
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

describe("makeWorkspaceSecretResolver — happy path", () => {
  test("resolves secret_name for the bound orgId", async () => {
    const store = makeStore([
      { orgId: "org_acme", serviceName: "my_api_key", plaintext: "sk_live_abc" },
    ]);
    const resolver = makeWorkspaceSecretResolver({ orgId: "org_acme", store });
    const value = await resolver("my_api_key");
    assert.equal(value, "sk_live_abc");
  });

  test("binds to orgId — different org can't access", async () => {
    const store = makeStore([
      { orgId: "org_acme", serviceName: "key_a", plaintext: "value_a" },
      { orgId: "org_beta", serviceName: "key_a", plaintext: "value_b" },
    ]);
    const resolver = makeWorkspaceSecretResolver({ orgId: "org_acme", store });
    const value = await resolver("key_a");
    // Must NOT return org_beta's value.
    assert.equal(value, "value_a");
  });
});

describe("makeWorkspaceSecretResolver — misses throw", () => {
  test("unknown secret_name throws", async () => {
    const store = makeStore([
      { orgId: "org_acme", serviceName: "other_key", plaintext: "x" },
    ]);
    const resolver = makeWorkspaceSecretResolver({ orgId: "org_acme", store });
    await assert.rejects(
      () => resolver("missing_key"),
      /secret.*missing_key|not found/i,
    );
  });

  test("secret exists for different org throws (no cross-org leak)", async () => {
    const store = makeStore([
      { orgId: "org_other", serviceName: "key_x", plaintext: "leak_me" },
    ]);
    const resolver = makeWorkspaceSecretResolver({ orgId: "org_acme", store });
    await assert.rejects(() => resolver("key_x"));
  });
});
