import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProtectedResourceMetadata } from "@/lib/oauth/protected-resource-metadata";

describe("buildProtectedResourceMetadata", () => {
  it("returns the exact literal MCP resource URL and a single-entry authorization_servers array", () => {
    const doc = buildProtectedResourceMetadata({
      mcpResourceUrl: "https://mcp.seldonframe.com/v1",
      authorizationServerIssuer: "https://app.seldonframe.com",
    });
    assert.equal(doc.resource, "https://mcp.seldonframe.com/v1");
    assert.deepEqual(doc.authorization_servers, ["https://app.seldonframe.com"]);
  });
});
