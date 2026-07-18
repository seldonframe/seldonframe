// Deterministic replay — Reelier phase 2c slice 1 (OBSERVE MODE ONLY).
// Pure properties of the trace-record FORMAT module: seq/i ordering,
// redaction, and the two caps (per-body truncation + total-records, the
// latter owned by the recorder but bounded by TRACE_MAX_RECORDS here).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  makeMetaRecord,
  makeNoteRecord,
  makeCallRecord,
  makeResultRecord,
  redact,
  capTraceBody,
  TRACE_BODY_MAX_CHARS,
  TRACE_MAX_RECORDS,
} from "@/lib/deployments/replay/trace-format";

describe("record shape + seq/i ordering", () => {
  test("meta record is always seq 0", () => {
    const meta = makeMetaRecord({ name: "email:dep_1", startedAt: "2026-07-17T00:00:00.000Z", wrapped: ["a"] });
    assert.equal(meta.t, "meta");
    assert.equal(meta.seq, 0);
    assert.equal(meta.name, "email:dep_1");
    assert.deepEqual(meta.wrapped, ["a"]);
  });

  test("note record carries the given seq verbatim", () => {
    const note = makeNoteRecord({ seq: 3, ts: "2026-07-17T00:00:01.000Z", text: "hi" });
    assert.equal(note.t, "note");
    assert.equal(note.seq, 3);
    assert.equal(note.text, "hi");
  });

  test("call/result pairs carry the SAME call index i, independent of seq", () => {
    const call = makeCallRecord({ seq: 1, i: 0, ts: "t1", tool: "GMAIL_SEND_EMAIL", args: { to: "a@b.com" } });
    const result = makeResultRecord({ seq: 2, i: 0, ok: true, ms: 12, body: { id: "m1" } });
    assert.equal(call.i, 0);
    assert.equal(result.i, 0);
    assert.equal(call.seq, 1);
    assert.equal(result.seq, 2);
  });

  test("a second call/result pair increments i independently of seq", () => {
    const call = makeCallRecord({ seq: 5, i: 1, ts: "t2", tool: "GMAIL_LABEL", args: {} });
    assert.equal(call.i, 1);
  });
});

describe("redact — secret-shaped strings never reach storage", () => {
  test("masks an sk- style key inside a plain string", () => {
    const out = redact("key is sk-abcdefghijklmno") as string;
    assert.ok(!out.includes("sk-abcdefghijklmno"));
    assert.ok(out.includes("[redacted]"));
  });

  test("masks a Bearer token inside a plain string", () => {
    const out = redact("Authorization: Bearer abcdefghij123456") as string;
    assert.ok(!out.includes("abcdefghij123456"));
    assert.ok(out.includes("Bearer [redacted]"));
  });

  test("recurses into nested objects/arrays", () => {
    const out = redact({
      headers: { authorization: "Bearer abcdefghij123456" },
      keys: ["sk-abcdefghijklmno", "plain-value"],
    }) as { headers: { authorization: string }; keys: string[] };
    assert.ok(out.headers.authorization.includes("[redacted]"));
    assert.ok(out.keys[0].includes("[redacted]"));
    assert.equal(out.keys[1], "plain-value");
  });

  test("non-string primitives and null pass through unchanged", () => {
    assert.equal(redact(42), 42);
    assert.equal(redact(true), true);
    assert.equal(redact(null), null);
    assert.equal(redact(undefined), undefined);
  });

  test("a short-looking token that doesn't match either shape is left alone", () => {
    assert.equal(redact("hello world"), "hello world");
  });
});

describe("capTraceBody — per-record truncation with an explicit marker", () => {
  test("small body passes through unchanged", () => {
    const body = { ok: true, id: "x" };
    assert.deepEqual(capTraceBody(body), body);
  });

  test("oversized body is replaced with a truncated preview + marker, never silently dropped", () => {
    const big = { data: "x".repeat(TRACE_BODY_MAX_CHARS * 2) };
    const out = capTraceBody(big) as { __truncated: boolean; preview: string; originalLength: number };
    assert.equal(out.__truncated, true);
    assert.ok(out.preview.length <= TRACE_BODY_MAX_CHARS);
    assert.ok(out.originalLength > TRACE_BODY_MAX_CHARS);
  });

  test("unserializable value (circular) never throws — degrades to a fixed marker", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.equal(capTraceBody(circular), "[trace body was not serializable]");
  });
});

describe("makeResultRecord — redaction + cap applied together", () => {
  test("a result body carrying a secret AND exceeding the cap is both redacted and truncated", () => {
    const big = { token: "Bearer abcdefghij123456", filler: "x".repeat(TRACE_BODY_MAX_CHARS * 2) };
    const result = makeResultRecord({ seq: 1, i: 0, ok: true, ms: 5, body: big });
    const out = result.body as { __truncated: boolean; preview: string };
    assert.equal(out.__truncated, true);
    assert.ok(out.preview.includes("[redacted]"));
    assert.ok(!out.preview.includes("abcdefghij123456"));
  });
});

describe("TRACE_MAX_RECORDS — sane, positive cap", () => {
  test("is a positive integer", () => {
    assert.ok(Number.isInteger(TRACE_MAX_RECORDS));
    assert.ok(TRACE_MAX_RECORDS > 0);
  });
});
