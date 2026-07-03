import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractWorkspaceToken } from "@/lib/auth/workspace-token";

// Gateway proxies (Smithery run.tools, directory health-checkers) forward the
// configured key as the RAW Authorization value with no `Bearer ` scheme.
// extractWorkspaceToken must accept both forms and reject everything else.
describe("extractWorkspaceToken", () => {
  it("accepts the standard Bearer form", () => {
    assert.equal(extractWorkspaceToken("Bearer wst_abc123"), "wst_abc123");
  });

  it("accepts lowercase bearer scheme", () => {
    assert.equal(extractWorkspaceToken("bearer wst_abc123"), "wst_abc123");
  });

  it("accepts a bare wst_ token with no scheme (gateway-forwarded)", () => {
    assert.equal(extractWorkspaceToken("wst_abc123"), "wst_abc123");
  });

  it("trims surrounding whitespace on the bare form", () => {
    assert.equal(extractWorkspaceToken("  wst_abc123  "), "wst_abc123");
  });

  it("still extracts a non-wst token from Bearer form (validator rejects it downstream)", () => {
    assert.equal(extractWorkspaceToken("Bearer sk-something"), "sk-something");
  });

  it("rejects other auth schemes", () => {
    assert.equal(extractWorkspaceToken("Basic d3N0X2FiYw=="), null);
  });

  it("rejects a bare value that is not wst_-prefixed", () => {
    assert.equal(extractWorkspaceToken("some-random-value"), null);
  });

  it("rejects a bare value containing whitespace", () => {
    assert.equal(extractWorkspaceToken("wst_abc 123"), null);
  });

  it("rejects empty string", () => {
    assert.equal(extractWorkspaceToken(""), null);
  });
});
