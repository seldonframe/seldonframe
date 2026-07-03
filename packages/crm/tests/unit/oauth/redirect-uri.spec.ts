import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRedirectUriAllowed } from "@/lib/oauth/redirect-uri";

describe("isRedirectUriAllowed", () => {
  it("accepts an exact match against the allowlist", () => {
    assert.equal(
      isRedirectUriAllowed("https://claude.ai/api/mcp/auth_callback", ["https://claude.ai/api/mcp/auth_callback"]),
      true
    );
  });

  it("rejects a URI not in the allowlist", () => {
    assert.equal(isRedirectUriAllowed("https://evil.example.com/callback", ["https://claude.ai/api/mcp/auth_callback"]), false);
  });

  it("rejects a near-miss (trailing slash difference) — exact match only, no normalization", () => {
    assert.equal(
      isRedirectUriAllowed("https://claude.ai/api/mcp/auth_callback/", ["https://claude.ai/api/mcp/auth_callback"]),
      false
    );
  });

  it("accepts Claude Code's loopback http://localhost/callback ignoring the port, per RFC 8252 §7.3", () => {
    assert.equal(isRedirectUriAllowed("http://localhost:54321/callback", ["http://localhost/callback"]), true);
  });

  it("accepts Claude Code's loopback http://127.0.0.1/callback ignoring the port", () => {
    assert.equal(isRedirectUriAllowed("http://127.0.0.1:9999/callback", ["http://127.0.0.1/callback"]), true);
  });

  it("does NOT apply the port-agnostic exception to a non-loopback host", () => {
    assert.equal(isRedirectUriAllowed("http://example.com:8080/callback", ["http://example.com/callback"]), false);
  });

  it("does NOT apply the port-agnostic exception across scheme (http vs https)", () => {
    assert.equal(isRedirectUriAllowed("https://localhost:54321/callback", ["http://localhost/callback"]), false);
  });

  it("does NOT apply the port-agnostic exception across differing paths", () => {
    assert.equal(isRedirectUriAllowed("http://localhost:54321/other-path", ["http://localhost/callback"]), false);
  });

  it("rejects a malformed URI without throwing", () => {
    assert.equal(isRedirectUriAllowed("not a url", ["http://localhost/callback"]), false);
  });
});
