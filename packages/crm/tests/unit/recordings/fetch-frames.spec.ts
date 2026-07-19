import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { fetchFramesAsBase64 } from "@/lib/recordings/fetch-frames";

const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const GOOD_URL = (n: number) =>
  `https://abc123.public.blob.vercel-storage.com/recordings/${SESSION_ID}/frame-${n}.jpg`;

function fakeFetch(statusByUrl: Record<string, number> = {}) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const status = statusByUrl[url] ?? 200;
    return {
      ok: status === 200,
      status,
      arrayBuffer: async () => Buffer.from(`bytes-for-${url}`).buffer,
    } as unknown as Response;
  }) as typeof fetch;
  return { impl, calls };
}

describe("fetchFramesAsBase64", () => {
  test("happy path: fetches every url and returns base64 in order", async () => {
    const urls = [GOOD_URL(0), GOOD_URL(1), GOOD_URL(2)];
    const { impl, calls } = fakeFetch();
    const frames = await fetchFramesAsBase64(urls, { fetchImpl: impl });
    assert.equal(frames.length, 3);
    assert.deepEqual(calls, urls);
    for (const frame of frames) {
      assert.equal(typeof frame.base64, "string");
      assert.ok(frame.base64.length > 0);
    }
  });

  test("non-200 response throws", async () => {
    const urls = [GOOD_URL(0), GOOD_URL(1)];
    const { impl } = fakeFetch({ [GOOD_URL(1)]: 404 });
    await assert.rejects(() => fetchFramesAsBase64(urls, { fetchImpl: impl }), /404/);
  });

  test("foreign host throws without ever calling fetch", async () => {
    const urls = [`https://evil.example.com/recordings/${SESSION_ID}/frame-0.jpg`];
    const { impl, calls } = fakeFetch();
    await assert.rejects(() => fetchFramesAsBase64(urls, { fetchImpl: impl }), /not allowed/);
    assert.equal(calls.length, 0);
  });

  test("path outside recordings/ throws", async () => {
    const urls = [`https://abc123.public.blob.vercel-storage.com/uploads/${SESSION_ID}/frame-0.jpg`];
    const { impl } = fakeFetch();
    await assert.rejects(() => fetchFramesAsBase64(urls, { fetchImpl: impl }), /not allowed/);
  });

  test("more urls than the cap → truncates to the cap", async () => {
    const urls = [GOOD_URL(0), GOOD_URL(1), GOOD_URL(2), GOOD_URL(3)];
    const { impl, calls } = fakeFetch();
    const frames = await fetchFramesAsBase64(urls, { fetchImpl: impl, maxFrames: 2 });
    assert.equal(frames.length, 2);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls, [GOOD_URL(0), GOOD_URL(1)]);
  });
});
