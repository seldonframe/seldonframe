// SeldonFrame Builder MCP — the real streamable-HTTP transport at
// mcp.seldonframe.com/v1 (rewritten here from that host by src/proxy.ts — see
// its "builder MCP host rewrite" block).
//
//   POST /api/mcp/v1     (JSON-RPC 2.0, Streamable HTTP)
//   Authorization: Bearer wst_...   (REQUIRED on every request — no public mode)
//
// This is the endpoint the /build page's connect snippet actually points IDE
// agents at (`claude mcp add seldonframe --transport http
// https://mcp.seldonframe.com/v1 --header "Authorization: Bearer wst_..."`).
// Before this route existed, that host fell through to the marketing catch-
// all and returned HTML 200/404 — "failed to connect" for every client.
//
// AUTH: every request (including `initialize`) runs through guardApiRequest —
// the SAME guard /api/v1/build/{discover,inspect,run} use — BEFORE any JSON-RPC
// parsing happens. A missing/invalid/expired `wst_` bearer gets an HTTP 401
// carrying a JSON-RPC error body (so a strict JSON-RPC client still gets a
// parseable envelope) rather than a bare 401. There is deliberately NO
// unauthenticated initialize here (unlike the public ChatGPT/rental MCPs):
// this transport drives real workspace data, so key discipline applies from
// the very first byte.
//
// TOOL SURFACE: exactly the three tools /api/v1/build/{discover,inspect,run}
// already expose over HTTP — discover/inspect/run. This route does NOT
// reimplement their logic; `buildRealBridge` makes an internal same-origin
// fetch to the real route, forwarding the caller's OWN Authorization header,
// so the bridged route's own guardApiRequest re-validates the exact same key
// and every invariant (rate-limit, demo-readonly, org-scoping, wallet
// gating) applies identically to an MCP call as to a direct HTTP call. This
// is "a thin adapter over the existing authed surface" by construction, not
// by convention.
//
// GET → 405 with Allow: POST. We don't implement the SSE channel in v1 (a
// clean 405 is spec-legal per the MCP Streamable HTTP transport and is what
// lets a client fall back to plain POST-only mode) — this is the fix for the
// bug report: the CURRENT behavior at this host is a 404/200 HTML page, which
// breaks the handshake outright. A clean 405 is a well-formed answer a real
// MCP client already knows how to interpret.
//
// All dispatch logic lives in lib/build/mcp/build-mcp-handler (unit-tested
// with fakes); this route is a thin wrapper: auth gate → parse body → bind the
// real bridge → map { status, body } onto NextResponse.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import {
  handleBuildMcpRpc,
  unauthorizedRpcBody,
  type BuildMcpDeps,
  type BridgeResult,
} from "@/lib/build/mcp/build-mcp-handler";
import type { BuildToolName } from "@/lib/build/mcp/build-mcp-rpc";

// CORS: an MCP client (an IDE agent) may run in a browser-hosted extension or
// a local CLI process. The endpoint is bearer-gated (unlike the public
// ChatGPT/rental MCPs, which permit "*" because they have no per-user auth to
// leak) — a permissive Origin here doesn't loosen anything either, since every
// request still needs a valid `wst_` key checked server-side; it only affects
// which pages' JS may read the response.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// We do NOT implement the SSE Streamable-HTTP channel in v1. A GET is a
// spec-legal way for a client to probe for it; answering 405 (not 404) tells
// the client unambiguously "this server doesn't support that, use POST",
// which is what lets a compliant client fall back cleanly.
export async function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { ...CORS_HEADERS, Allow: "POST" },
  });
}

/**
 * Bridge one MCP tool call to its underlying /api/v1/build/<tool> HTTP route
 * via an internal same-origin fetch, forwarding the caller's OWN Authorization
 * header (so the target route's guardApiRequest re-validates the same bearer
 * — no double-trust, no privilege change). Never throws on a non-2xx (the
 * handler's runBridged wraps the caller in a try/catch anyway, but resolving
 * to the JSON body either way keeps this function's contract simple: return
 * whatever the HTTP route said, verbatim).
 */
function buildRealBridge(request: Request): BuildMcpDeps["bridge"] {
  const authorization = request.headers.get("authorization") ?? "";
  return async (tool: BuildToolName, body: Record<string, unknown>): Promise<BridgeResult> => {
    const url = new URL(`/api/v1/build/${tool}`, request.url);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await response.json().catch(() => ({ error: "The bridged route returned a non-JSON response." }))) as Record<
      string,
      unknown
    >;
    return { status: response.status, json };
  };
}

export async function POST(request: Request): Promise<Response> {
  // AUTH FIRST, before any JSON-RPC parsing: a missing/invalid `wst_` bearer
  // never reaches method dispatch. guardApiRequest is the SAME guard every
  // /api/v1/build/* route runs (rate-limit + demo-readonly + bearer resolve),
  // so this endpoint's auth contract is byte-identical to the HTTP API's.
  const guard = await guardApiRequest(request);
  if (guard.error) {
    // Carry a JSON-RPC error envelope in the 401 body so a strict JSON-RPC
    // client (which expects a parseable envelope even on transport failure)
    // doesn't just see a bare, unparseable 401 — while still returning the
    // real HTTP 401 status a bearer-auth client checks.
    return NextResponse.json(unauthorizedRpcBody(), { status: 401, headers: CORS_HEADERS });
  }
  // Mirrors the exact double-check every /api/v1/build/* route runs (see
  // discover/inspect/run route.ts): guardApiRequest's success shape doesn't
  // guarantee orgId is present just because `error` is falsy, so check it
  // explicitly rather than asserting.
  if (!guard.orgId) {
    return NextResponse.json(unauthorizedRpcBody(), { status: 401, headers: CORS_HEADERS });
  }
  const orgId = guard.orgId;

  const rawBody = await request.text();
  const deps: BuildMcpDeps = {
    orgId,
    bridge: buildRealBridge(request),
    now: () => new Date(),
  };

  const outcome = await handleBuildMcpRpc(rawBody, deps);

  if (outcome.body === null) {
    // Notification ack — 202, no body (matches what an MCP client expects).
    return new NextResponse(null, { status: outcome.status, headers: CORS_HEADERS });
  }
  return NextResponse.json(outcome.body, { status: outcome.status, headers: CORS_HEADERS });
}
