import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  validateRawWorkspaceToken,
  type QueryApiKeyByPrefixAndHash,
} from "@/lib/auth/workspace-token";

// These tests exercise validateRawWorkspaceToken's kind-matching behavior
// against a fake db layer, mirroring the DI style already used elsewhere in
// this test suite for DB-touching pure logic (see design doc §2.10 — this
// repo's node:test convention). We are NOT hitting a real Postgres here;
// the query seam (queryApiKeyByPrefixAndHash, introduced in Task 2 exactly
// so this is testable) is injected as a fake that emulates the SQL WHERE
// clause: a row resolves only when its kind is in the requested kinds array
// AND prefix+hash match. The load-bearing assertion is that
// validateRawWorkspaceToken requests kinds ["workspace", "oauth"] — the
// widened WHERE — while everything else (expiry check, null-for-all-failures)
// behaves exactly as before.

type FakeRow = {
  id: string;
  orgId: string;
  expiresAt: Date | null;
  kind: string;
  keyPrefix: string;
  keyHash: string;
};

function makeToken(): { raw: string; prefix: string; hash: string } {
  const raw = `wst_${crypto.randomBytes(32).toString("base64url")}`;
  return {
    raw,
    prefix: raw.slice(0, 8),
    hash: crypto.createHash("sha256").update(raw).digest("hex"),
  };
}

function fakeQuery(rows: FakeRow[]) {
  const calls: Array<{ kinds: string[]; prefix: string; hash: string }> = [];
  const fn: QueryApiKeyByPrefixAndHash = async ({ kinds, prefix, hash }) => {
    calls.push({ kinds: [...kinds], prefix, hash });
    const row = rows.find(
      (r) => (kinds as string[]).includes(r.kind) && r.keyPrefix === prefix && r.keyHash === hash
    );
    if (!row) return undefined;
    return { id: row.id, orgId: row.orgId, expiresAt: row.expiresAt };
  };
  return { calls, fn };
}

describe("validateRawWorkspaceToken kind matching (post Task 2)", () => {
  it("resolves a token with kind='workspace' (existing behavior, unchanged)", async () => {
    const t = makeToken();
    const { fn } = fakeQuery([
      { id: "id-1", orgId: "org-1", expiresAt: null, kind: "workspace", keyPrefix: t.prefix, keyHash: t.hash },
    ]);
    const result = await validateRawWorkspaceToken(t.raw, fn);
    assert.deepEqual(result, { orgId: "org-1", tokenId: "id-1" });
  });

  it("resolves a token with kind='oauth' (new behavior)", async () => {
    const t = makeToken();
    const { fn } = fakeQuery([
      { id: "id-2", orgId: "org-2", expiresAt: null, kind: "oauth", keyPrefix: t.prefix, keyHash: t.hash },
    ]);
    const result = await validateRawWorkspaceToken(t.raw, fn);
    assert.deepEqual(result, { orgId: "org-2", tokenId: "id-2" });
  });

  it("still rejects a token with kind='user' (legacy x-api-key rows must never validate as a bearer)", async () => {
    const t = makeToken();
    const { calls, fn } = fakeQuery([
      { id: "id-3", orgId: "org-3", expiresAt: null, kind: "user", keyPrefix: t.prefix, keyHash: t.hash },
    ]);
    const result = await validateRawWorkspaceToken(t.raw, fn);
    assert.equal(result, null);
    // The widened-WHERE proof: exactly workspace + oauth are requested —
    // "user" must never be in the accepted-kinds set.
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].kinds, ["workspace", "oauth"]);
  });

  it("still rejects an expired token regardless of kind (expiry check unchanged for kind='oauth')", async () => {
    const t = makeToken();
    const { fn } = fakeQuery([
      {
        id: "id-4",
        orgId: "org-4",
        expiresAt: new Date(Date.now() - 1000),
        kind: "oauth",
        keyPrefix: t.prefix,
        keyHash: t.hash,
      },
    ]);
    const result = await validateRawWorkspaceToken(t.raw, fn);
    assert.equal(result, null);
  });
});
