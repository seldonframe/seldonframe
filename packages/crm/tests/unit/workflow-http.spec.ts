// Tests for lib/workflow/http.ts — fetchWithTimeout + response path
// extractor.
// SLICE 6 PR 1 C3 per audit §4.1 + G-6-2 + §12 (1MB body cap).

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import {
  fetchWithTimeout,
  extractResponsePath,
} from "../../src/lib/workflow/http";

// ---------------------------------------------------------------------
// Test HTTP server — spins up for the fetchWithTimeout suite
// ---------------------------------------------------------------------

let server: http.Server;
let baseUrl: string;

before(
  () =>
    new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

        // /ok — simple JSON 200
        if (url.pathname === "/ok") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", count: 5 }));
          return;
        }
        // /slow — waits 100ms then responds (used for timeout tests)
        if (url.pathname === "/slow") {
          setTimeout(() => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ delayed: true }));
          }, 100);
          return;
        }
        // /sleep — waits 2s (longer than timeout tests)
        if (url.pathname === "/sleep") {
          setTimeout(() => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('{"slept":true}');
          }, 2000);
          return;
        }
        // /error — 500
        if (url.pathname === "/error") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "internal" }));
          return;
        }
        // /notfound — 404
        if (url.pathname === "/notfound") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("not found");
          return;
        }
        // /text — returns text, not JSON
        if (url.pathname === "/text") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("hello world");
          return;
        }
        // /huge — 2MB body (exceeds the 1MB cap)
        if (url.pathname === "/huge") {
          const big = "x".repeat(2 * 1024 * 1024);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ payload: big }));
          return;
        }
        // /echo-headers — reflects request headers back
        if (url.pathname === "/echo-headers") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ headers: req.headers }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    }),
);

after(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

// ---------------------------------------------------------------------
// fetchWithTimeout
// ---------------------------------------------------------------------

describe("fetchWithTimeout — happy path", () => {
  test("returns {ok: true, status: 200, body: parsed JSON} on success", async () => {
    const result = await fetchWithTimeout(`${baseUrl}/ok`, {}, 5000);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: "ok", count: 5 });
    assert.ok(typeof result.elapsedMs === "number" && result.elapsedMs >= 0);
  });

  test("passes custom headers", async () => {
    const result = await fetchWithTimeout(
      `${baseUrl}/echo-headers`,
      { headers: { "X-Custom-Header": "hello" } },
      5000,
    );
    assert.equal(result.ok, true);
    const echoed = (result.body as { headers: Record<string, string> }).headers;
    assert.equal(echoed["x-custom-header"], "hello");
  });

  test("handles non-JSON response body as string fallback", async () => {
    const result = await fetchWithTimeout(`${baseUrl}/text`, {}, 5000);
    assert.equal(result.ok, true);
    assert.equal(result.body, "hello world");
  });
});

describe("fetchWithTimeout — HTTP errors (non-2xx)", () => {
  test("returns {ok: false, status: 500} on 500 response (no throw)", async () => {
    const result = await fetchWithTimeout(`${baseUrl}/error`, {}, 5000);
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: "internal" });
  });

  test("returns {ok: false, status: 404} on 404 response (no throw)", async () => {
    const result = await fetchWithTimeout(`${baseUrl}/notfound`, {}, 5000);
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
  });
});

describe("fetchWithTimeout — timeout", () => {
  test("throws with cause='timeout' when response exceeds timeoutMs", async () => {
    await assert.rejects(
      () => fetchWithTimeout(`${baseUrl}/sleep`, {}, 100),
      (err) => {
        assert.ok(err instanceof Error);
        const e = err as Error & { cause?: string };
        assert.equal(e.cause, "timeout");
        return true;
      },
    );
  });

  test("completes normally when response arrives before timeout", async () => {
    const result = await fetchWithTimeout(`${baseUrl}/slow`, {}, 5000);
    assert.equal(result.ok, true);
  });
});

describe("fetchWithTimeout — network failure", () => {
  test("throws with cause='network' on connection refused", async () => {
    await assert.rejects(
      () => fetchWithTimeout("http://127.0.0.1:1", {}, 5000),
      (err) => {
        assert.ok(err instanceof Error);
        const e = err as Error & { cause?: string };
        assert.equal(e.cause, "network");
        return true;
      },
    );
  });
});

describe("fetchWithTimeout — response body cap (1MB)", () => {
  test("throws with cause='body_too_large' when response exceeds 1MB", async () => {
    await assert.rejects(
      () => fetchWithTimeout(`${baseUrl}/huge`, {}, 10000),
      (err) => {
        assert.ok(err instanceof Error);
        const e = err as Error & { cause?: string };
        assert.equal(e.cause, "body_too_large");
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------
// extractResponsePath
// ---------------------------------------------------------------------

describe("extractResponsePath — dotted object descent", () => {
  test("simple key access", () => {
    assert.equal(extractResponsePath({ status: "ok" }, "status"), "ok");
  });

  test("nested descent", () => {
    assert.equal(
      extractResponsePath({ data: { user: { tier: "VIP" } } }, "data.user.tier"),
      "VIP",
    );
  });

  test("missing key returns undefined", () => {
    assert.equal(extractResponsePath({ status: "ok" }, "missing"), undefined);
  });

  test("null/undefined traversal returns undefined", () => {
    assert.equal(extractResponsePath(null, "a.b"), undefined);
    assert.equal(extractResponsePath(undefined, "a.b"), undefined);
    assert.equal(extractResponsePath({ a: null }, "a.b"), undefined);
  });
});

describe("extractResponsePath — array indexing", () => {
  test("[n] at end of path", () => {
    assert.equal(extractResponsePath({ items: [1, 2, 3] }, "items[0]"), 1);
    assert.equal(extractResponsePath({ items: [1, 2, 3] }, "items[2]"), 3);
  });

  test("[n] with nested descent after", () => {
    assert.equal(
      extractResponsePath(
        { current: { weather: [{ main: "Rain" }, { main: "Clear" }] } },
        "current.weather[0].main",
      ),
      "Rain",
    );
  });

  test("index out of bounds returns undefined", () => {
    assert.equal(extractResponsePath({ items: [1, 2] }, "items[5]"), undefined);
  });

  test("array index at start", () => {
    assert.equal(extractResponsePath([{ id: 1 }, { id: 2 }], "[1].id"), 2);
  });

  test("nested array indexing", () => {
    assert.equal(
      extractResponsePath({ grid: [[1, 2], [3, 4]] }, "grid[1][0]"),
      3,
    );
  });
});

describe("extractResponsePath — edge cases", () => {
  test("boolean / number / null leaf values are returned as-is", () => {
    assert.equal(extractResponsePath({ x: true }, "x"), true);
    assert.equal(extractResponsePath({ x: 42 }, "x"), 42);
    assert.equal(extractResponsePath({ x: null }, "x"), null);
  });

  test("empty path returns the input itself", () => {
    const obj = { a: 1 };
    assert.deepEqual(extractResponsePath(obj, ""), obj);
  });

  test("object values returned as-is", () => {
    const nested = { a: 1 };
    assert.deepEqual(extractResponsePath({ x: nested }, "x"), nested);
  });

  test("negative index returns undefined (unsupported)", () => {
    assert.equal(extractResponsePath({ items: [1, 2] }, "items[-1]"), undefined);
  });
});
