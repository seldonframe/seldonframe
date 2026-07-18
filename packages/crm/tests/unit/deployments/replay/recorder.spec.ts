// Deterministic replay — Reelier phase 2c slice 1 (OBSERVE MODE ONLY).
// TraceRecorder: wrapCall must append call+result records with ok=false on
// throw, and MUST let the original result/throw pass through to the caller
// completely unchanged — this is a pure observation seam, never allowed to
// alter the turn it's watching.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { TraceRecorder } from "@/lib/deployments/replay/recorder";
import { TRACE_MAX_RECORDS } from "@/lib/deployments/replay/trace-format";

function makeRecorder() {
  return new TraceRecorder({ name: "email:dep_1", startedAt: "2026-07-17T00:00:00.000Z", wrapped: ["look_up_availability"] });
}

describe("TraceRecorder — happy path", () => {
  test("finish() starts with exactly one meta record (seq 0)", () => {
    const rec = makeRecorder();
    const records = rec.finish();
    assert.equal(records.length, 1);
    assert.equal(records[0].t, "meta");
    assert.equal(records[0].seq, 0);
  });

  test("wrapCall appends a call record then a result record, ok:true, on success", async () => {
    const rec = makeRecorder();
    const result = await rec.wrapCall("GMAIL_SEND_EMAIL", { to: "a@b.com" }, async () => ({ id: "m1" }));
    assert.deepEqual(result, { id: "m1" });

    const records = rec.finish();
    assert.equal(records.length, 3); // meta, call, result
    const call = records[1];
    const res = records[2];
    assert.equal(call.t, "call");
    assert.equal(res.t, "result");
    if (call.t === "call" && res.t === "result") {
      assert.equal(call.tool, "GMAIL_SEND_EMAIL");
      assert.equal(call.i, 0);
      assert.equal(res.i, 0);
      assert.equal(res.ok, true);
      assert.ok(res.ms >= 0);
    }
  });

  test("the ORIGINAL resolved value is returned unchanged (byte-for-byte)", async () => {
    const rec = makeRecorder();
    const original = { nested: { arr: [1, 2, 3] }, flag: true };
    const result = await rec.wrapCall("t", {}, async () => original);
    assert.equal(result, original); // same reference — never cloned/altered
  });

  test("callCount increments once per wrapCall, independent of record count", async () => {
    const rec = makeRecorder();
    await rec.wrapCall("a", {}, async () => 1);
    await rec.wrapCall("b", {}, async () => 2);
    assert.equal(rec.callCount, 2);
  });
});

describe("TraceRecorder — throw passthrough", () => {
  test("a thrown error propagates to the caller UNCHANGED", async () => {
    const rec = makeRecorder();
    const boom = new Error("upstream 500");
    await assert.rejects(
      rec.wrapCall("GMAIL_SEND_EMAIL", {}, async () => {
        throw boom;
      }),
      (err: unknown) => err === boom, // exact same object — never wrapped/replaced
    );
  });

  test("a throw still appends a result record with ok:false and the error message", async () => {
    const rec = makeRecorder();
    await assert.rejects(
      rec.wrapCall("GMAIL_SEND_EMAIL", {}, async () => {
        throw new Error("upstream 500");
      }),
    );
    const records = rec.finish();
    const res = records[2];
    assert.equal(res.t, "result");
    if (res.t === "result") {
      assert.equal(res.ok, false);
      assert.deepEqual(res.body, { error: "upstream 500" });
    }
  });

  test("a non-Error throw is stringified, never crashes the recorder", async () => {
    const rec = makeRecorder();
    await assert.rejects(
      rec.wrapCall("t", {}, async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw "plain string failure";
      }),
    );
    const records = rec.finish();
    const res = records[2];
    if (res.t === "result") {
      assert.deepEqual(res.body, { error: "plain string failure" });
    }
  });
});

describe("TraceRecorder — record-count cap", () => {
  test("stops growing past TRACE_MAX_RECORDS; isCapped flips true", async () => {
    const rec = makeRecorder();
    // Each wrapCall appends 2 records (call + result); meta is 1 already.
    const iterations = Math.ceil(TRACE_MAX_RECORDS / 2) + 5;
    for (let n = 0; n < iterations; n++) {
      await rec.wrapCall(`tool_${n}`, {}, async () => ({ ok: true }));
    }
    const records = rec.finish();
    assert.ok(records.length <= TRACE_MAX_RECORDS);
    assert.equal(rec.isCapped, true);
  });

  test("a call made after the cap still resolves/throws normally — capping never breaks the turn", async () => {
    const rec = makeRecorder();
    const iterations = Math.ceil(TRACE_MAX_RECORDS / 2) + 5;
    for (let n = 0; n < iterations; n++) {
      await rec.wrapCall(`tool_${n}`, {}, async () => ({ ok: true }));
    }
    const result = await rec.wrapCall("final_tool", {}, async () => ({ done: true }));
    assert.deepEqual(result, { done: true });
  });
});
