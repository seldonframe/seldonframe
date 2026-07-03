#!/usr/bin/env node
// Smoke-tests the full OAuth 2.1 + DCR flow against a dev/staging deploy.
// Steps 1-4 and 6-8 are fully automated; step 5 (the actual consent-screen
// click) requires a human with a real logged-in browser session — this
// script prints the URL to open and pauses for the human to paste back the
// resulting `code` query param.
//
// Usage: BASE_URL=https://<dev-deploy> node scripts/smoke-oauth-connector.mjs

import crypto from "node:crypto";
import readline from "node:readline/promises";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const MCP_BASE_URL = process.env.MCP_BASE_URL ?? BASE_URL; // override if mcp host differs from app host locally

// S256 PKCE challenge — SAME algorithm as src/lib/oauth/pkce.ts's
// computeCodeChallengeS256 (RFC 7636 §4.2), INTENTIONALLY duplicated inline:
// this script runs standalone via plain `node`, outside the Next.js/tsx
// module resolution the rest of the app uses, so it cannot import
// @/lib/oauth/pkce. If you ever change the PKCE algorithm in one place,
// remember to check the other.
function computeS256Challenge(verifier) {
  return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
}

async function main() {
  console.log("1. Fetching /.well-known/oauth-protected-resource ...");
  const prm = await fetch(`${MCP_BASE_URL}/.well-known/oauth-protected-resource`).then((r) => r.json());
  console.log(prm);
  if (prm.resource !== "https://mcp.seldonframe.com/v1") {
    throw new Error(`resource mismatch: ${prm.resource}`);
  }
  if (!Array.isArray(prm.authorization_servers) || prm.authorization_servers.length !== 1) {
    throw new Error("authorization_servers must be a single-entry array");
  }

  console.log("2. Fetching /.well-known/oauth-authorization-server ...");
  const asMeta = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`).then((r) => r.json());
  console.log(asMeta);
  if (JSON.stringify(asMeta.code_challenge_methods_supported) !== JSON.stringify(["S256"])) {
    throw new Error("code_challenge_methods_supported must be exactly [\"S256\"]");
  }

  console.log("3. Registering a client via DCR ...");
  const redirectUri = "http://127.0.0.1:8765/callback";
  const registerResponse = await fetch(`${BASE_URL}/api/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: [redirectUri], client_name: "smoke-test" }),
  }).then((r) => r.json());
  console.log(registerResponse);
  const clientId = registerResponse.client_id;
  if (!clientId) throw new Error("registration did not return a client_id");

  console.log("4. Generating PKCE pair ...");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = computeS256Challenge(codeVerifier);

  const authorizeUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", "smoke-test-state");
  authorizeUrl.searchParams.set("resource", "https://mcp.seldonframe.com/v1");

  console.log("\n5. MANUAL STEP — open this URL in a browser where you are already logged in:");
  console.log(authorizeUrl.toString());
  console.log("After clicking Approve, you'll be redirected to a URL like:");
  console.log(`  ${redirectUri}?code=XXXXX&state=smoke-test-state`);
  console.log("(that request will fail to connect since nothing listens on 127.0.0.1:8765 — that's expected, just copy the `code` param from the browser's address bar before it errors)\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await rl.question("Paste the `code` value here: ");
  rl.close();

  console.log("\n6. Exchanging code for tokens ...");
  const tokenResponse = await fetch(`${BASE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code.trim(),
      code_verifier: codeVerifier,
      client_id: clientId,
      redirect_uri: redirectUri,
    }),
  }).then((r) => r.json());
  console.log(tokenResponse);
  if (!tokenResponse.access_token?.startsWith("wst_")) {
    throw new Error("access_token missing or not wst_-prefixed");
  }
  if (!tokenResponse.refresh_token) {
    throw new Error("refresh_token missing from authorization_code grant response");
  }

  console.log("\n7. Calling the MCP endpoint with the minted access_token ...");
  const mcpResponse = await fetch(`${MCP_BASE_URL}/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenResponse.access_token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  console.log(`MCP call status: ${mcpResponse.status}`);
  if (mcpResponse.status !== 200) {
    throw new Error(`expected 200 from authenticated MCP call, got ${mcpResponse.status}`);
  }

  console.log("\n8. Exercising refresh rotation + reuse detection ...");
  const firstRefreshToken = tokenResponse.refresh_token;
  const rotated = await fetch(`${BASE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: firstRefreshToken, client_id: clientId }),
  }).then((r) => r.json());
  console.log("First rotation:", rotated);
  if (!rotated.refresh_token || rotated.refresh_token === firstRefreshToken) {
    throw new Error("refresh rotation did not return a NEW refresh_token");
  }

  console.log("Replaying the OLD (now-revoked) refresh_token — expect invalid_grant ...");
  const replayResponse = await fetch(`${BASE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: firstRefreshToken, client_id: clientId }),
  });
  const replayBody = await replayResponse.json();
  console.log(`Replay status: ${replayResponse.status}`, replayBody);
  if (replayResponse.status !== 400 || replayBody.error !== "invalid_grant") {
    throw new Error("expected 400 invalid_grant when replaying a rotated-away refresh token");
  }

  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
