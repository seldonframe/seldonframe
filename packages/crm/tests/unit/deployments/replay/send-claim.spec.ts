// Replay gate v2 — send-claim.ts unit tests (spec §2, migration 0077's
// replay_send_claims). The claim RACE itself is a real Postgres unique-
// constraint behavior (no DB in this unit-test harness — see
// tests/unit/deployments/replay/replay-before-llm.spec.ts's own DI
// pattern) — simulated here with a fake `insert` that throws a 23505 on
// its second call for the same key, exactly as a concurrent second INSERT
// against the real UNIQUE index would.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { claimSendStep, markSendClaimOutcome } from "@/lib/deployments/replay/send-claim";

const INPUT = { orgId: "org_1", skillId: "skill_1", stepN: 2, idempotencyKey: "msg_abc" };

function uniqueViolation(): Error & { code: string } {
  const err = new Error(
    'duplicate key value violates unique constraint "replay_send_claims_skill_step_key_idx"',
  ) as Error & { code: string };
  err.code = "23505";
  return err;
}

describe("claimSendStep — the double-send lock", () => {
  test("claim race: two concurrent attempts for the SAME key -> exactly ONE claimed:true", async () => {
    let calls = 0;
    const insert = async (row: { orgId: string; skillId: string; stepN: number; idempotencyKey: string }) => {
      calls++;
      assert.equal(row.idempotencyKey, "msg_abc");
      if (calls === 1) return { id: "claim_1" };
      // The SECOND concurrent INSERT for the same (skill_id, step_n, key)
      // loses the real unique index race.
      throw uniqueViolation();
    };

    const [first, second] = await Promise.all([
      claimSendStep(INPUT, { insert }),
      claimSendStep(INPUT, { insert }),
    ]);

    const claimedResults = [first, second].filter((r) => r.claimed);
    const notClaimedResults = [first, second].filter((r) => !r.claimed);
    assert.equal(claimedResults.length, 1, "exactly one attempt must win the claim");
    assert.equal(notClaimedResults.length, 1);
    assert.equal(
      notClaimedResults[0].claimed === false ? notClaimedResults[0].reason : undefined,
      "already-claimed",
    );
  });

  test("a fresh key claims successfully — outcome starts 'unknown'", async () => {
    let capturedRow: unknown;
    const insert = async (row: unknown) => {
      capturedRow = row;
      return { id: "claim_42" };
    };
    const result = await claimSendStep(INPUT, { insert });
    assert.deepEqual(result, { claimed: true, claimId: "claim_42" });
    assert.deepEqual(capturedRow, {
      orgId: "org_1",
      skillId: "skill_1",
      stepN: 2,
      idempotencyKey: "msg_abc",
      outcome: "unknown",
    });
  });

  test("redelivery: the SAME key on a later, separate attempt is refused (already-claimed), never re-executed", async () => {
    const insert = async () => {
      throw uniqueViolation();
    };
    const result = await claimSendStep(INPUT, { insert });
    assert.deepEqual(result, { claimed: false, reason: "already-claimed" });
  });

  test("a non-unique-violation insert failure FAILS CLOSED (claim-error, never silently treated as claimed)", async () => {
    const insert = async () => {
      throw new Error("connection reset");
    };
    const result = await claimSendStep(INPUT, { insert });
    assert.deepEqual(result, { claimed: false, reason: "claim-error" });
  });

  test("never throws into the caller — even a non-Error throw is swallowed into claim-error", async () => {
    const insert = async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "not an Error instance";
    };
    await assert.doesNotReject(() => claimSendStep(INPUT, { insert }));
    const result = await claimSendStep(INPUT, { insert });
    assert.equal(result.claimed, false);
  });
});

describe("markSendClaimOutcome — fail-soft bookkeeping", () => {
  test("updates the claim row's outcome via the injected updater", async () => {
    const updates: Array<{ claimId: string; outcome: string }> = [];
    await markSendClaimOutcome("claim_1", "sent", {
      updateOutcome: async (claimId, outcome) => {
        updates.push({ claimId, outcome });
      },
    });
    assert.deepEqual(updates, [{ claimId: "claim_1", outcome: "sent" }]);
  });

  test("a throwing updater never rejects (fail-soft)", async () => {
    await assert.doesNotReject(() =>
      markSendClaimOutcome("claim_1", "failed", {
        updateOutcome: async () => {
          throw new Error("db down");
        },
      }),
    );
  });
});
