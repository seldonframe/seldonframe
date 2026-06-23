// Unit tests for lib/acp/processor.ts — the MONEY-SAFETY core.
//
// These tests are the airtight proof that v1 charges nothing:
//   1. devStubProcessor returns ok + a fake ref, NEVER throws, makes NO network
//      call (we'd see it as an unhandled async / timeout — there's no fetch).
//   2. resolveProcessor() returns the stub when ACP_LIVE is unset.
//   3. With ACP_LIVE === "true" resolveProcessor() THROWS — proving there is no
//      silent live charge path; turning it on is a deliberate, loud failure
//      until Max implements the real processor.

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { devStubProcessor, resolveProcessor } from "../../../src/lib/acp/processor";

const ORIGINAL_ACP_LIVE = process.env.ACP_LIVE;

afterEach(() => {
  // Restore the env between tests so flag flips don't leak.
  if (ORIGINAL_ACP_LIVE === undefined) delete process.env.ACP_LIVE;
  else process.env.ACP_LIVE = ORIGINAL_ACP_LIVE;
});

describe("devStubProcessor", () => {
  test("returns ok + a clearly-fake stub ref tied to the session id", async () => {
    const r = await devStubProcessor.authorizeAndCapture({
      sessionId: "acp_sess_xyz",
      amountCents: 2500,
      currency: "usd",
      paymentToken: "spt_test",
      feeCents: 125,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.paymentRef, "acp_stub_acp_sess_xyz");
      assert.ok(r.paymentRef.startsWith("acp_stub_"));
    }
  });

  test("free / zero-amount path returns ok with the acp_free ref", async () => {
    const r = await devStubProcessor.authorizeAndCapture({
      sessionId: "acp_sess_free",
      amountCents: 0,
      currency: "usd",
      paymentToken: "spt_test",
      feeCents: 0,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.paymentRef, "acp_free");
  });

  test("treats a negative amount as free (never charges)", async () => {
    const r = await devStubProcessor.authorizeAndCapture({
      sessionId: "acp_sess_neg",
      amountCents: -100,
      currency: "usd",
      paymentToken: "spt_test",
      feeCents: 0,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.paymentRef, "acp_free");
  });

  test("never throws — even on a totally empty input", async () => {
    await assert.doesNotReject(async () => {
      // @ts-expect-error — deliberately malformed to prove it can't throw.
      await devStubProcessor.authorizeAndCapture({});
    });
  });

  test("returns synchronously-resolvable result with no network (fast)", async () => {
    const start = Date.now();
    await devStubProcessor.authorizeAndCapture({
      sessionId: "acp_sess_fast",
      amountCents: 999,
      currency: "usd",
      paymentToken: "spt_test",
      feeCents: 50,
    });
    // A network call would add real latency; the stub resolves in-process.
    assert.ok(Date.now() - start < 50);
  });
});

describe("resolveProcessor", () => {
  test("returns the dev stub when ACP_LIVE is unset", () => {
    delete process.env.ACP_LIVE;
    assert.equal(resolveProcessor(), devStubProcessor);
  });

  test("returns the dev stub when ACP_LIVE is any non-'true' value", () => {
    process.env.ACP_LIVE = "1";
    assert.equal(resolveProcessor(), devStubProcessor);
    process.env.ACP_LIVE = "false";
    assert.equal(resolveProcessor(), devStubProcessor);
  });

  test("THROWS when ACP_LIVE === 'true' (no silent live charge path in v1)", () => {
    process.env.ACP_LIVE = "true";
    assert.throws(() => resolveProcessor(), /ACP live processor not configured/);
  });
});
