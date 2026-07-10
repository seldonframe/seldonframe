// Authz tests for the Task 7 recording routes — mirrors the style of
// tests/unit/approvals-api-authz.spec.ts: exercise the pure
// authorize/gate functions directly with DI'd fakes (never a real DB, never
// a real Next.js Request), same as web-build-stream-route.spec.ts's
// resolveWebBuildGate pattern.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  authorizeRecordingSubmission,
  extractBearerToken,
  isAllowedRecordingPathname,
  isValidRecordingBlobUrl,
  resolveSessionCreateGate,
  resolveSessionFetchGate,
  resolveUploadGrant,
} from "@/lib/recordings/route-guards";
import { MAX_RECORDINGS_PER_SESSION, RECORDING_SESSIONS_PER_DAY_PER_IP } from "@/lib/recordings/policy";
import { IMAGE_MAX_BYTES } from "@/lib/page-blocks/images";
import { VIDEO_MAX_BYTES } from "@/lib/media/resolve-url";

// All pure guards live in lib/recordings/route-guards.ts — route.ts files may
// only export handlers + segment config (Next build-time route validation),
// and keeping the guards blob-import-free is what makes them testable here.

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

// ── resolveUploadGrant — anonymous grant is jpeg/webm ONLY ───────────────────
// (security-review finding: the workspace media route's wider image list —
// svg, gif, png — must never apply to anonymous /record uploads; SVG on a
// public URL is a stored-XSS surface.)

describe("resolveUploadGrant", () => {
  test("image/jpeg → granted at IMAGE_MAX_BYTES, pinned to jpeg only", () => {
    const grant = resolveUploadGrant({ contentType: "image/jpeg" });
    assert.deepEqual(grant, { allowedContentTypes: ["image/jpeg"], maximumSizeInBytes: IMAGE_MAX_BYTES });
  });

  test("video/webm → granted at VIDEO_MAX_BYTES", () => {
    const grant = resolveUploadGrant({ contentType: "video/webm" });
    assert.deepEqual(grant, { allowedContentTypes: ["video/webm"], maximumSizeInBytes: VIDEO_MAX_BYTES });
  });

  test("script-bearing / other image formats are all rejected", () => {
    for (const contentType of ["image/svg+xml", "image/gif", "image/png", "image/webp", "text/html", "video/mp4", ""]) {
      assert.equal(resolveUploadGrant({ contentType }), null, `expected null for ${contentType || "(empty)"}`);
    }
  });
});

// ── extractBearerToken ───────────────────────────────────────────────────────

describe("extractBearerToken", () => {
  test("extracts the token from a well-formed header", () => {
    assert.equal(extractBearerToken("Bearer abc123"), "abc123");
  });

  test("null header → null", () => {
    assert.equal(extractBearerToken(null), null);
  });

  test("missing 'Bearer ' prefix → null", () => {
    assert.equal(extractBearerToken("abc123"), null);
  });

  test("'Bearer ' with only whitespace after → null", () => {
    assert.equal(extractBearerToken("Bearer    "), null);
  });
});

// ── resolveSessionFetchGate (GET /session rehydration) ──────────────────────

describe("resolveSessionFetchGate", () => {
  test("flag off → not_found regardless of token", async () => {
    const out = await resolveSessionFetchGate({
      env: {},
      rawToken: "good-token",
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.deepEqual(out, { kind: "not_found" });
  });

  test("flag on + no token → unauthorized", async () => {
    const out = await resolveSessionFetchGate({
      env: { SF_RECORD_TO_AGENT: "1" },
      rawToken: null,
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.deepEqual(out, { kind: "unauthorized" });
  });

  test("flag on + bad/unknown token (lookup misses) → unauthorized", async () => {
    const out = await resolveSessionFetchGate({
      env: { SF_RECORD_TO_AGENT: "1" },
      rawToken: "bad-token",
      lookupSession: async () => null,
    });
    assert.deepEqual(out, { kind: "unauthorized" });
  });

  test("flag on + valid token → ok with sessionId", async () => {
    const out = await resolveSessionFetchGate({
      env: { SF_RECORD_TO_AGENT: "1" },
      rawToken: "good-token",
      lookupSession: async () => ({ id: SESSION_ID }),
    });
    assert.deepEqual(out, { kind: "ok", sessionId: SESSION_ID });
  });
});

// ── isAllowedRecordingPathname ───────────────────────────────────────────────

describe("isAllowedRecordingPathname", () => {
  test("accepts own-session prefix (with or without leading slash)", () => {
    assert.equal(isAllowedRecordingPathname(`recordings/${SESSION_ID}/frame-1.jpg`, SESSION_ID), true);
    assert.equal(isAllowedRecordingPathname(`/recordings/${SESSION_ID}/frame-1.jpg`, SESSION_ID), true);
  });

  test("rejects another session's prefix and non-recordings paths", () => {
    assert.equal(isAllowedRecordingPathname(`recordings/${OTHER_SESSION_ID}/frame-1.jpg`, SESSION_ID), false);
    assert.equal(isAllowedRecordingPathname(`avatars/${SESSION_ID}/x.jpg`, SESSION_ID), false);
  });
});

