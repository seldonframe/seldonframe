import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAuthorizeRequest } from "@/lib/oauth/authorize-request";
import { isAllowedAuthorizeFetchSite } from "@/lib/oauth/fetch-metadata-guard";

describe("parseAuthorizeRequest", () => {
  const validParams = new URLSearchParams({
    response_type: "code",
    client_id: "abc123",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "xyz",
  });

  it("accepts a well-formed request", () => {
    const result = parseAuthorizeRequest(validParams);
    assert.equal(result.ok, true);
  });

  it("rejects response_type other than 'code'", () => {
    const params = new URLSearchParams(validParams);
    params.set("response_type", "token");
    assert.equal(parseAuthorizeRequest(params).ok, false);
  });

  it("rejects code_challenge_method other than 'S256' (e.g. 'plain')", () => {
    const params = new URLSearchParams(validParams);
    params.set("code_challenge_method", "plain");
    const result = parseAuthorizeRequest(params);
    assert.equal(result.ok, false);
  });

  it("rejects a missing code_challenge (PKCE is mandatory, not optional)", () => {
    const params = new URLSearchParams(validParams);
    params.delete("code_challenge");
    assert.equal(parseAuthorizeRequest(params).ok, false);
  });

  it("rejects a missing client_id", () => {
    const params = new URLSearchParams(validParams);
    params.delete("client_id");
    assert.equal(parseAuthorizeRequest(params).ok, false);
  });

  it("rejects a missing redirect_uri", () => {
    const params = new URLSearchParams(validParams);
    params.delete("redirect_uri");
    assert.equal(parseAuthorizeRequest(params).ok, false);
  });

  it("passes through an optional resource param when present", () => {
    const params = new URLSearchParams(validParams);
    params.set("resource", "https://mcp.seldonframe.com/v1");
    const result = parseAuthorizeRequest(params);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.resource, "https://mcp.seldonframe.com/v1");
  });

  it("leaves resource undefined when absent (not required — client MUST send it per spec, but server tolerates its absence rather than hard-failing, since resource binding here is defense-in-depth not the sole audience check)", () => {
    const result = parseAuthorizeRequest(validParams);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.resource, undefined);
  });

  it("preserves state verbatim for later passthrough", () => {
    const result = parseAuthorizeRequest(validParams);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.state, "xyz");
  });
});

// 2026-07-03 — security review finding: the /oauth/authorize consent POST
// relied only on the implicit SameSite=Lax cookie for CSRF protection. The
// route now also asserts Sec-Fetch-Site explicitly; this covers the pure
// decision function that assertion delegates to.
describe("isAllowedAuthorizeFetchSite", () => {
  it("rejects a cross-site POST", () => {
    assert.equal(isAllowedAuthorizeFetchSite("cross-site"), false);
  });

  it("allows a same-origin POST (the normal consent-approve flow)", () => {
    assert.equal(isAllowedAuthorizeFetchSite("same-origin"), true);
  });

  it("allows when the header is absent (older clients, unit tests — preserves prior behavior)", () => {
    assert.equal(isAllowedAuthorizeFetchSite(null), true);
  });

  it("allows 'none' (direct address-bar navigation sends none, not same-origin)", () => {
    assert.equal(isAllowedAuthorizeFetchSite("none"), true);
  });

  it("rejects 'same-site' (a sibling subdomain is still not this exact origin)", () => {
    assert.equal(isAllowedAuthorizeFetchSite("same-site"), false);
  });
});
