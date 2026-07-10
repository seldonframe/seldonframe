import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { transcribeVideoUrl, TRANSCRIBE_MAX_BYTES, isTranscriptEffectivelyEmpty } from "@/lib/recordings/transcribe";

const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const GOOD_URL = `https://abc123.public.blob.vercel-storage.com/recordings/${SESSION_ID}/video.webm`;

function fakeFetch(
  handlers: Record<string, () => Response | Promise<Response>>,
): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const handler = handlers[url];
    if (!handler) {
      throw new Error(`no fake handler registered for ${url}`);
    }
    return handler();
  }) as typeof fetch;
  return { impl, calls };
}

function videoResponse(bytes: Uint8Array, contentLength?: number): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-length": String(contentLength ?? bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response;
}

function whisperResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("transcribeVideoUrl", () => {
  test("happy path: returns transcript segments from whisper verbose_json", async () => {
    const { impl, calls } = fakeFetch({
      [GOOD_URL]: () => videoResponse(new Uint8Array([1, 2, 3])),
      "https://api.openai.com/v1/audio/transcriptions": () =>
        whisperResponse({
          text: "hello world",
          segments: [
            { start: 0, text: "hello" },
            { start: 1.5, text: "world" },
          ],
        }),
    });

    const result = await transcribeVideoUrl({
      videoUrl: GOOD_URL,
      apiKey: "sk-test",
      sessionId: SESSION_ID,
      fetchImpl: impl,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.transcript, [
        { atMs: 0, text: "hello" },
        { atMs: 1500, text: "world" },
      ]);
    }
    assert.deepEqual(calls, [GOOD_URL, "https://api.openai.com/v1/audio/transcriptions"]);
  });

  test("no segments falls back to whole text at atMs 0", async () => {
    const { impl } = fakeFetch({
      [GOOD_URL]: () => videoResponse(new Uint8Array([1, 2, 3])),
      "https://api.openai.com/v1/audio/transcriptions": () => whisperResponse({ text: "hello world" }),
    });

    const result = await transcribeVideoUrl({
      videoUrl: GOOD_URL,
      apiKey: "sk-test",
      sessionId: SESSION_ID,
      fetchImpl: impl,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.transcript, [{ atMs: 0, text: "hello world" }]);
    }
  });

  test("oversize content-length rejects without downloading the body", async () => {
    const { impl, calls } = fakeFetch({
      [GOOD_URL]: () => videoResponse(new Uint8Array([1]), TRANSCRIBE_MAX_BYTES + 1),
    });

    const result = await transcribeVideoUrl({
      videoUrl: GOOD_URL,
      apiKey: "sk-test",
      sessionId: SESSION_ID,
      fetchImpl: impl,
    });

    assert.equal(result.ok, false);
    // Only the video HEAD/GET was called — never the whisper API, since we
    // never even attempted to read the (oversize) body.
    assert.deepEqual(calls, [GOOD_URL]);
  });

  test("foreign host rejects without ever calling fetch", async () => {
    const { impl, calls } = fakeFetch({});
    const result = await transcribeVideoUrl({
      videoUrl: `https://evil.example.com/recordings/${SESSION_ID}/video.webm`,
      apiKey: "sk-test",
      sessionId: SESSION_ID,
      fetchImpl: impl,
    });

    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });

  test("wrong session prefix rejects without ever calling fetch", async () => {
    const { impl, calls } = fakeFetch({});
    const otherSession = "55555555-5555-4555-8555-555555555555";
    const result = await transcribeVideoUrl({
      videoUrl: `https://abc123.public.blob.vercel-storage.com/recordings/${otherSession}/video.webm`,
      apiKey: "sk-test",
      sessionId: SESSION_ID,
      fetchImpl: impl,
    });

    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });

  test("whisper API 500 → ok:false, never throws", async () => {
    const { impl } = fakeFetch({
      [GOOD_URL]: () => videoResponse(new Uint8Array([1, 2, 3])),
      "https://api.openai.com/v1/audio/transcriptions": () => whisperResponse({ error: "boom" }, 500),
    });

    const result = await transcribeVideoUrl({
      videoUrl: GOOD_URL,
      apiKey: "sk-test",
      sessionId: SESSION_ID,
      fetchImpl: impl,
    });

    assert.equal(result.ok, false);
  });

  test("network error on video fetch → ok:false, never throws", async () => {
    const impl = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;

    const result = await transcribeVideoUrl({
      videoUrl: GOOD_URL,
      apiKey: "sk-test",
      sessionId: SESSION_ID,
      fetchImpl: impl,
    });

    assert.equal(result.ok, false);
  });
});

describe("isTranscriptEffectivelyEmpty", () => {
  test("empty array is effectively empty", () => {
    assert.equal(isTranscriptEffectivelyEmpty([]), true);
  });

  test("single short segment (typed-summary fallback) is effectively empty", () => {
    assert.equal(isTranscriptEffectivelyEmpty([{ text: "clicked save" }]), true);
  });

  test("single long segment is NOT effectively empty", () => {
    assert.equal(
      isTranscriptEffectivelyEmpty([{ text: "a".repeat(31) }]),
      false,
    );
  });

  test("multiple segments are NOT effectively empty, even if short", () => {
    assert.equal(
      isTranscriptEffectivelyEmpty([{ text: "hi" }, { text: "there" }]),
      false,
    );
  });
});
