// Authz tests for the Task 7 recording routes — mirrors the style of
// tests/unit/approvals-api-authz.spec.ts: exercise the pure
// authorize/gate functions directly with DI'd fakes (never a real DB, never
// a real Next.js Request), same as web-build-stream-route.spec.ts's
// resolveWebBuildGate pattern.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  authorizeRecordingSubmission,
  isValidRecordingBlobUrl,
} from "@/app/api/v1/recordings/recording/route";
import { resolveSessionCreateGate } from "@/app/api/v1/recordings/session/route";
import { MAX_RECORDINGS_PER_SESSION, RECORDING_SESSIONS_PER_DAY_PER_IP } from "@/lib/recordings/policy";

// NOTE: upload/route.ts's pure helpers (isAllowedRecordingPathname,
// resolveUploadGrant) are deliberately NOT imported/tested here — that file
// imports `@vercel/blob/client`, which is a package.json dependency but is
// not present under this worktree's node_modules junction (pre-existing
// environment gap, same as the untested sibling
// api/v1/workspace/media/upload/route.ts — no spec in this repo imports
// that route file directly, for the same reason). Importing it would fail
// module resolution at test-collection time, not at the assertion. The
// plan's Step 1 only requires covering the recording route's rejections;
// see the compile-agent-route note in wave-c-report.md for the deviation.

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SESSION_ID = "22222222-2222-4222-8222-222222222222";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    slotIndex: 0,
    label: "test slot",
    transcript: [{ atMs: 0, text: "hello" }],
    frameBlobUrls: [`https://abc123.public.blob.vercel-storage.com/recordings/${SESSION_ID}/frame-0.jpg`],
    ...overrides,
  };
}

// ── authorizeRecordingSubmission ────────────────────────────────────────────

describe("authorizeRecordingSubmission", () => {
  test("no bearer token → unauthorized", async () => {
    const outcome = await authorizeRecordingSubmission({
      rawToken: null,
      body: validBody(),
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.equal(outcome.kind, "unauthorized");
  });

  test("bad/unknown token (lookup misses) → unauthorized", async () => {
    const outcome = await authorizeRecordingSubmission({
      rawToken: "bad-token",
      body: validBody(),
      lookupSession: async () => null,
    });
    assert.equal(outcome.kind, "unauthorized");
  });

  test("valid token + valid body → ok", async () => {
    const outcome = await authorizeRecordingSubmission({
      rawToken: "good-token",
      body: validBody(),
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.equal(outcome.kind, "ok");
    if (outcome.kind === "ok") {
      assert.equal(outcome.sessionId, SESSION_ID);
      assert.equal(outcome.body.slotIndex, 0);
    }
  });

  test("foreign blob host → bad_request (400)", async () => {
    const outcome = await authorizeRecordingSubmission({
      rawToken: "good-token",
      body: validBody({ frameBlobUrls: [`https://evil.example.com/recordings/${SESSION_ID}/frame-0.jpg`] }),
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.equal(outcome.kind, "bad_request");
  });

  test("pathname outside recordings/<sessionId>/ → bad_request (400)", async () => {
    const outcome = await authorizeRecordingSubmission({
      rawToken: "good-token",
      body: validBody({
        frameBlobUrls: [`https://abc123.public.blob.vercel-storage.com/recordings/${OTHER_SESSION_ID}/frame-0.jpg`],
      }),
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.equal(outcome.kind, "bad_request");
  });

  test("videoBlobUrl outside recordings/<sessionId>/ → bad_request (400)", async () => {
    const outcome = await authorizeRecordingSubmission({
      rawToken: "good-token",
      body: validBody({
        videoBlobUrl: `https://abc123.public.blob.vercel-storage.com/recordings/${OTHER_SESSION_ID}/video.webm`,
      }),
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.equal(outcome.kind, "bad_request");
  });

  test("slotIndex >= MAX_RECORDINGS_PER_SESSION → bad_request (400)", async () => {
    const outcome = await authorizeRecordingSubmission({
      rawToken: "good-token",
      body: validBody({ slotIndex: MAX_RECORDINGS_PER_SESSION }),
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.equal(outcome.kind, "bad_request");
  });

  test("negative slotIndex → bad_request (400)", async () => {
    const outcome = await authorizeRecordingSubmission({
      rawToken: "good-token",
      body: validBody({ slotIndex: -1 }),
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.equal(outcome.kind, "bad_request");
  });

  test("malformed body (missing transcript) → bad_request (400)", async () => {
    const outcome = await authorizeRecordingSubmission({
      rawToken: "good-token",
      body: { slotIndex: 0, frameBlobUrls: [] },
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.equal(outcome.kind, "bad_request");
  });
});

// ── isValidRecordingBlobUrl ──────────────────────────────────────────────────

describe("isValidRecordingBlobUrl", () => {
  test("accepts correct host + session prefix", () => {
    assert.equal(
      isValidRecordingBlobUrl(`https://abc123.public.blob.vercel-storage.com/recordings/${SESSION_ID}/x.jpg`, SESSION_ID),
      true,
    );
  });

  test("rejects a host that merely contains the suffix as a substring elsewhere", () => {
    assert.equal(
      isValidRecordingBlobUrl(`https://public.blob.vercel-storage.com.evil.com/recordings/${SESSION_ID}/x.jpg`, SESSION_ID),
      false,
    );
  });

  test("rejects wrong host entirely", () => {
    assert.equal(isValidRecordingBlobUrl(`https://evil.com/recordings/${SESSION_ID}/x.jpg`, SESSION_ID), false);
  });

  test("rejects malformed URL", () => {
    assert.equal(isValidRecordingBlobUrl("not-a-url", SESSION_ID), false);
  });
});

// ── resolveSessionCreateGate ─────────────────────────────────────────────────

describe("resolveSessionCreateGate", () => {
  test("flag off → not_found regardless of count", async () => {
    const out = await resolveSessionCreateGate({}, async () => 0, RECORDING_SESSIONS_PER_DAY_PER_IP);
    assert.deepEqual(out, { kind: "not_found" });
  });

  test("flag on + under limit → ok", async () => {
    const out = await resolveSessionCreateGate(
      { SF_RECORD_TO_AGENT: "1" },
      async () => 0,
      RECORDING_SESSIONS_PER_DAY_PER_IP,
    );
    assert.deepEqual(out, { kind: "ok" });
  });

  test("flag on + at limit → rate_limited", async () => {
    const out = await resolveSessionCreateGate(
      { SF_RECORD_TO_AGENT: "1" },
      async () => RECORDING_SESSIONS_PER_DAY_PER_IP,
      RECORDING_SESSIONS_PER_DAY_PER_IP,
    );
    assert.deepEqual(out, { kind: "rate_limited" });
  });
});

