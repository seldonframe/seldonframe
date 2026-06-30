// Developer API key — the IDE connect path (spec 1ff09dcb, P0 Task 3).
//
// The key itself is minted/revealed/revoked by the EXISTING /settings/api
// surface (reused, not re-implemented). The one net-new pure bit is the MCP
// connector command that wires the key into the IDE over Streamable HTTP —
// shown in the reveal panel + SKILL.md. This pins its shape.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildMcpConnectSnippet } from "../../../src/lib/build/developer-key";

describe("buildMcpConnectSnippet", () => {
  test("embeds the raw key in a copy-paste claude mcp add command over Streamable HTTP", () => {
    const raw = "wst_THE_RAW_KEY";
    const snippet = buildMcpConnectSnippet(raw, "https://mcp.seldonframe.com/v1");
    assert.match(snippet, /claude mcp add seldonframe/);
    assert.match(snippet, /--transport http/);
    assert.ok(snippet.includes(raw), "must carry the raw key the dev just minted");
    assert.ok(snippet.includes("https://mcp.seldonframe.com/v1"));
    assert.match(snippet, /Authorization: Bearer/);
  });

  test("is deterministic", () => {
    const a = buildMcpConnectSnippet("wst_x", "https://mcp.seldonframe.com/v1");
    const b = buildMcpConnectSnippet("wst_x", "https://mcp.seldonframe.com/v1");
    assert.equal(a, b);
  });
});
