import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRegisterRequest } from "@/lib/oauth/register-request";

describe("parseRegisterRequest", () => {
  it("accepts a well-formed request with an https redirect_uri", () => {
    const result = parseRegisterRequest({
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      client_name: "Claude",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value.redirectUris, ["https://claude.ai/api/mcp/auth_callback"]);
      assert.equal(result.value.clientName, "Claude");
    }
  });

  it("accepts a loopback http redirect_uri (Claude Code)", () => {
    const result = parseRegisterRequest({ redirect_uris: ["http://localhost/callback"] });
    assert.equal(result.ok, true);
  });

  it("accepts the 127.0.0.1 loopback form", () => {
    const result = parseRegisterRequest({ redirect_uris: ["http://127.0.0.1/callback"] });
    assert.equal(result.ok, true);
  });

  it("rejects a non-HTTPS, non-loopback redirect_uri (open redirect / MITM risk)", () => {
    const result = parseRegisterRequest({ redirect_uris: ["http://evil.example.com/callback"] });
    assert.equal(result.ok, false);
  });

  it("rejects an empty redirect_uris array", () => {
    const result = parseRegisterRequest({ redirect_uris: [] });
    assert.equal(result.ok, false);
  });

  it("rejects a missing redirect_uris field", () => {
    const result = parseRegisterRequest({});
    assert.equal(result.ok, false);
  });

  it("rejects a malformed redirect_uri string", () => {
    const result = parseRegisterRequest({ redirect_uris: ["not a url"] });
    assert.equal(result.ok, false);
  });

  it("defaults client_name to undefined when omitted (not required by RFC 7591)", () => {
    const result = parseRegisterRequest({ redirect_uris: ["https://example.com/callback"] });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.clientName, undefined);
  });

  it("truncates an absurdly long client_name rather than rejecting (defense against a griefing payload, not a spec requirement)", () => {
    const longName = "x".repeat(5000);
    const result = parseRegisterRequest({ redirect_uris: ["https://example.com/callback"], client_name: longName });
    assert.equal(result.ok, true);
    if (result.ok) assert.ok((result.value.clientName?.length ?? 0) <= 256);
  });
});
