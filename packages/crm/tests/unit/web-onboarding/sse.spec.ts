// packages/crm/tests/unit/web-onboarding/sse.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { createSseStream } from "../../../src/lib/web-onboarding/sse";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

describe("createSseStream", () => {
  test("frames a single event with name and JSON data", async () => {
    const { stream, emit, close } = createSseStream();
    emit("fetching", { url: "https://x.com" });
    close();
    const text = await readAll(stream);
    assert.match(text, /^event: fetching\ndata: \{"url":"https:\/\/x.com"\}\n\n/);
  });

  test("frames multiple events in order", async () => {
    const { stream, emit, close } = createSseStream();
    emit("a", { n: 1 });
    emit("b", { n: 2 });
    close();
    const text = await readAll(stream);
    const lines = text.trim().split(/\n\n/);
    assert.equal(lines[0], 'event: a\ndata: {"n":1}');
    assert.equal(lines[1], 'event: b\ndata: {"n":2}');
  });

  test("error() emits an error event with code + body", async () => {
    const { stream, error, close } = createSseStream();
    error(402, { reason: "workspace_limit_reached", limit: 1 });
    close();
    const text = await readAll(stream);
    assert.match(text, /event: error\ndata: \{"code":402,"reason":"workspace_limit_reached","limit":1\}/);
  });
});
