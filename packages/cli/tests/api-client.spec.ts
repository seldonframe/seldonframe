// api-client — the marketplace API client, exercised against a FAKE fetch (zero
// network). Pins: the request URL/method/auth-header/body for each endpoint, and
// honest error mapping (NoKeyError, 401, 402, generic).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ApiClient,
  ApiError,
  NoKeyError,
  NetworkError,
  normalizeBaseUrl,
  type FetchLike,
} from "../src/lib/api-client.js";

type Capture = { url: string; method: string; headers: Record<string, string>; body?: string };

/** A fake fetch that records the last request and returns a canned response. */
function fakeFetch(
  response: { ok: boolean; status: number; json: unknown },
  capture: Capture[],
): FetchLike {
  return async (url, init) => {
    capture.push({ url, method: init.method, headers: init.headers, body: init.body });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.json,
      text: async () => JSON.stringify(response.json),
    };
  };
}

function client(fetchImpl: FetchLike, apiKey: string | null = "wst_test") {
  return new ApiClient({ baseUrl: "https://app.seldonframe.com", apiKey, fetchImpl });
}

describe("normalizeBaseUrl", () => {
  test("strips trailing slashes and defaults when empty", () => {
    assert.equal(normalizeBaseUrl("https://app.seldonframe.com/"), "https://app.seldonframe.com");
    assert.equal(normalizeBaseUrl("https://x.com///"), "https://x.com");
    assert.equal(normalizeBaseUrl(""), "https://app.seldonframe.com");
    assert.equal(normalizeBaseUrl(null), "https://app.seldonframe.com");
  });
});

describe("auth + request shapes", () => {
  test("discover POSTs query+limit to /api/v1/build/discover with the bearer", async () => {
    const cap: Capture[] = [];
    const f = fakeFetch({ ok: true, status: 200, json: { results: [], count: 0 } }, cap);
    await client(f).discover("send email", 5);

    assert.equal(cap.length, 1);
    assert.equal(cap[0].url, "https://app.seldonframe.com/api/v1/build/discover");
    assert.equal(cap[0].method, "POST");
    assert.equal(cap[0].headers.Authorization, "Bearer wst_test");
    assert.equal(cap[0].headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(cap[0].body!), { query: "send email", limit: 5 });
  });

  test("discover omits limit when not provided", async () => {
    const cap: Capture[] = [];
    const f = fakeFetch({ ok: true, status: 200, json: { results: [], count: 0 } }, cap);
    await client(f).discover("hello");
    assert.deepEqual(JSON.parse(cap[0].body!), { query: "hello" });
  });

  test("inspect POSTs { type, id }", async () => {
    const cap: Capture[] = [];
    const f = fakeFetch(
      { ok: true, status: 200, json: { id: "GMAIL_SEND_EMAIL", type: "tool" } },
      cap,
    );
    await client(f).inspect("tool", "GMAIL_SEND_EMAIL");
    assert.equal(cap[0].url, "https://app.seldonframe.com/api/v1/build/inspect");
    assert.deepEqual(JSON.parse(cap[0].body!), { type: "tool", id: "GMAIL_SEND_EMAIL" });
  });

  test("run POSTs { type, id, input }", async () => {
    const cap: Capture[] = [];
    const f = fakeFetch(
      { ok: true, status: 200, json: { runId: "run_1", status: "completed", price: {}, billing: {} } },
      cap,
    );
    await client(f).run("agent", "ace", { message: "hi" });
    assert.equal(cap[0].url, "https://app.seldonframe.com/api/v1/build/run");
    assert.deepEqual(JSON.parse(cap[0].body!), {
      type: "agent",
      id: "ace",
      input: { message: "hi" },
    });
  });

  test("walletBalance GETs /wallet/balance with no body", async () => {
    const cap: Capture[] = [];
    const f = fakeFetch(
      { ok: true, status: 200, json: { balance: { value: 0, currency: "USD" }, earnings: { value: 0, currency: "USD" } } },
      cap,
    );
    const w = await client(f).walletBalance();
    assert.equal(cap[0].url, "https://app.seldonframe.com/api/v1/build/wallet/balance");
    assert.equal(cap[0].method, "GET");
    assert.equal(cap[0].body, undefined);
    assert.equal(cap[0].headers.Authorization, "Bearer wst_test");
    assert.equal(w.balance.currency, "USD");
  });
});

describe("error mapping", () => {
  test("no key → NoKeyError, never hits fetch", async () => {
    let called = false;
    const f: FetchLike = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    };
    await assert.rejects(() => client(f, null).discover("x"), (err: unknown) => {
      assert.ok(err instanceof NoKeyError);
      return true;
    });
    assert.equal(called, false);
  });

  test("401 → ApiError with status 401 and the server message", async () => {
    const cap: Capture[] = [];
    const f = fakeFetch({ ok: false, status: 401, json: { error: "Unauthorized" } }, cap);
    await assert.rejects(() => client(f).discover("x"), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal((err as ApiError).status, 401);
      assert.match((err as ApiError).message, /Unauthorized/);
      return true;
    });
  });

  test("402 → ApiError with status 402 (insufficient balance)", async () => {
    const cap: Capture[] = [];
    const f = fakeFetch(
      { ok: false, status: 402, json: { status: "insufficient_balance", error: "Insufficient wallet balance." } },
      cap,
    );
    await assert.rejects(() => client(f).run("agent", "ace", { message: "hi" }), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal((err as ApiError).status, 402);
      return true;
    });
  });

  test("a thrown fetch (offline) → NetworkError naming the base URL", async () => {
    const f: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(() => client(f).walletBalance(), (err: unknown) => {
      assert.ok(err instanceof NetworkError);
      assert.match((err as NetworkError).message, /app\.seldonframe\.com/);
      return true;
    });
  });

  test("a non-error body still parses (returns the JSON)", async () => {
    const cap: Capture[] = [];
    const f = fakeFetch({ ok: true, status: 200, json: { results: [{ id: "a" }], count: 1 } }, cap);
    const r = await client(f).discover("x");
    assert.equal(r.count, 1);
    assert.equal(r.results[0].id, "a");
  });
});
