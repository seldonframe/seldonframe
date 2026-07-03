import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAuthorizationServerMetadata } from "@/lib/oauth/authorization-server-metadata";

describe("buildAuthorizationServerMetadata", () => {
  it("advertises S256 as the ONLY supported PKCE method", () => {
    const doc = buildAuthorizationServerMetadata({ issuer: "https://app.seldonframe.com" });
    assert.deepEqual(doc.code_challenge_methods_supported, ["S256"]);
  });

  it("includes all three endpoint URLs derived from the issuer", () => {
    const doc = buildAuthorizationServerMetadata({ issuer: "https://app.seldonframe.com" });
    assert.equal(doc.issuer, "https://app.seldonframe.com");
    assert.equal(doc.authorization_endpoint, "https://app.seldonframe.com/oauth/authorize");
    assert.equal(doc.token_endpoint, "https://app.seldonframe.com/api/oauth/token");
    assert.equal(doc.registration_endpoint, "https://app.seldonframe.com/api/oauth/register");
  });

  it("advertises only the authorization_code and refresh_token grant types", () => {
    const doc = buildAuthorizationServerMetadata({ issuer: "https://app.seldonframe.com" });
    assert.deepEqual(doc.grant_types_supported, ["authorization_code", "refresh_token"]);
  });

  it("advertises token_endpoint_auth_methods_supported as public-client-only ('none')", () => {
    const doc = buildAuthorizationServerMetadata({ issuer: "https://app.seldonframe.com" });
    assert.deepEqual(doc.token_endpoint_auth_methods_supported, ["none"]);
  });
});
