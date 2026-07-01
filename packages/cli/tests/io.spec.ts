// io — the pure input parser + the honest error→message mapper.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { parseInputObject, errorToMessage } from "../src/lib/io.js";
import { ApiError, NoKeyError, NetworkError } from "../src/lib/api-client.js";

describe("parseInputObject", () => {
  test("parses a JSON object", () => {
    assert.deepEqual(parseInputObject('{"message":"hi"}'), { message: "hi" });
  });

  test("rejects invalid JSON with a clear message", () => {
    assert.throws(() => parseInputObject("{not json"), /not valid JSON/);
  });

  test("rejects non-objects (array, scalar)", () => {
    assert.throws(() => parseInputObject("[1,2]"), /must be a JSON object/);
    assert.throws(() => parseInputObject('"hi"'), /must be a JSON object/);
    assert.throws(() => parseInputObject("null"), /must be a JSON object/);
  });
});

describe("errorToMessage", () => {
  test("NoKeyError → the login hint", () => {
    assert.match(errorToMessage(new NoKeyError()), /seldonframe login/);
    assert.match(errorToMessage(new NoKeyError()), /build\/keys/);
  });

  test("401 → the login hint", () => {
    assert.match(errorToMessage(new ApiError(401, "Unauthorized")), /seldonframe login/);
    assert.match(errorToMessage(new ApiError(401, "Unauthorized")), /401/);
  });

  test("402 → the top-up hint", () => {
    const msg = errorToMessage(new ApiError(402, "Insufficient wallet balance."));
    assert.match(msg, /top up/i);
    assert.match(msg, /build\/wallet/);
  });

  test("429 → a retry hint", () => {
    assert.match(errorToMessage(new ApiError(429, "Rate limit exceeded")), /Rate limited/);
  });

  test("a generic ApiError surfaces status + message", () => {
    assert.match(errorToMessage(new ApiError(500, "boom")), /500/);
    assert.match(errorToMessage(new ApiError(500, "boom")), /boom/);
  });

  test("NetworkError → its message + a connection hint", () => {
    const msg = errorToMessage(new NetworkError("https://app.seldonframe.com", new Error("ECONNREFUSED")));
    assert.match(msg, /Could not reach/);
    assert.match(msg, /SELDONFRAME_API_BASE_URL/);
  });

  test("a plain Error passes its message through", () => {
    assert.equal(errorToMessage(new Error("nope")), "nope");
  });
});
