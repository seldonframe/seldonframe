// SKILL.md — the builder-marketplace funnel doc (spec 1ff09dcb, P0 Task 2).
//
// `set up https://seldonframe.com/SKILL.md` is the headline funnel: a dev (or
// their IDE agent) reads this Markdown and learns to connect the SeldonFrame
// MCP, build an agent from one sentence, eval it, and list it with a usage
// price — all without opening the dashboard. These tests lock the load-bearing
// content (the MCP URL, the connect mechanics, the build→eval→list→price flow,
// the key path) so a refactor that drops a step surfaces here, and pin the
// honest framing (listing is free; pricing is set, not charged).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildSkillMd, SKILL_MD_MCP_URL } from "../../../src/lib/build/skill-md";

describe("buildSkillMd", () => {
  const md = buildSkillMd();

  test("is non-trivial Markdown that opens with an H1 naming the builder marketplace", () => {
    assert.ok(md.length > 800, "SKILL.md should be a substantial doc");
    const firstLine = md.split("\n").find((l) => l.trim().length > 0) ?? "";
    assert.match(firstLine, /^#\s/, "first non-empty line is an H1");
    assert.match(firstLine, /SeldonFrame/i);
  });

  test("teaches the dev to add the SeldonFrame MCP as a connector over Streamable HTTP", () => {
    assert.ok(md.includes(SKILL_MD_MCP_URL), "must include the MCP server URL");
    assert.match(md, /MCP/);
    assert.match(md, /connector|streamable http|streamable-http/i);
  });

  test("documents the key path: get a key + authenticate with a Bearer token", () => {
    // The dev must learn HOW to authenticate the MCP. The path is a wst_ bearer
    // (Authorization: Bearer) issued at /build/keys.
    assert.match(md, /\/build\/keys/);
    assert.match(md, /Authorization:\s*Bearer/i);
    assert.match(md, /wst_/);
  });

  test("walks the build -> test -> list -> price flow by the real MCP tool names", () => {
    // The four load-bearing tools the spec names for P0.
    for (const tool of ["create_agent", "run_agent_evals", "publish_agent", "set_usage_price"]) {
      assert.ok(md.includes(tool), `SKILL.md should name the ${tool} tool`);
    }
    // Build from one sentence is the headline capability.
    assert.match(md, /one sentence|natural language|plain english/i);
  });

  test("includes a concrete usage-priced listing example (per-call)", () => {
    // The canonical demo from the spec: a 24/7 receptionist listed at $0.10/call.
    assert.match(md, /per_call|per call/i);
    assert.match(md, /0\.10|10\b/);
  });

  test("is money-honest: listing is free; you set a price, you are not charged", () => {
    assert.match(md, /listing is free|free to list|costs nothing to list/i);
  });

  test("documents the discover -> inspect -> run flow over the catalog (P1)", () => {
    // The unit a builder RUNS (agents + tools), not just builds: the three
    // Monid-shaped steps and their endpoints must be present so an IDE agent
    // learns to consume the catalog, each result carrying a price.
    for (const step of ["discover", "inspect", "run"]) {
      assert.match(md, new RegExp(`\\b${step}\\b`, "i"), `SKILL.md should name the ${step} step`);
    }
    assert.match(md, /\/api\/v1\/build\/discover/);
    assert.match(md, /\/api\/v1\/build\/inspect/);
    assert.match(md, /\/api\/v1\/build\/run/);
  });

  test("is money-honest about run: a run returns its cost but is not charged in P1", () => {
    // The P1 money-safety contract surfaced to the reader: run computes/records
    // the cost; the prepaid wallet (charging) is the next phase.
    assert.match(md, /calculatedcost|cost is recorded|not charged|wallet/i);
  });

  test("is deterministic (same output every call)", () => {
    assert.equal(buildSkillMd(), md);
  });

  test("the MCP URL is the seldonframe MCP origin", () => {
    assert.match(SKILL_MD_MCP_URL, /^https:\/\/mcp\.seldonframe\.com/);
  });
});
