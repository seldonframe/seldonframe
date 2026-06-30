// /build landing content — the developer-landing copy + snippets (spec 1ff09dcb).
//
// The landing is the human twin of SKILL.md. These tests pin the load-bearing
// content the page renders (the hero command, discover→inspect→run, the three
// rentable types, the IDE chat + tool chain, the connect snippet, the honest
// pricing facts) AND the cross-surface invariants: the hero command + MCP origin
// + key/wallet paths MATCH SKILL.md (one funnel), and the builder split is stated
// honestly (keep 95% / 5% fee / errors free). A refactor that drifts a fact from
// SKILL.md surfaces here.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  BUILD_SETUP_COMMAND,
  BUILD_KEYS_PATH,
  BUILD_WALLET_PATH,
  BUILD_MCP_URL,
  BUILDER_KEEP_PCT,
  SELDONFRAME_FEE_PCT,
  FLOW_STEPS,
  RENTABLE_TYPES,
  IDE_CHAT,
  IDE_TOOL_CHAIN,
  KEY_PLACEHOLDER,
  buildLandingConnectSnippet,
  PRICING_POINTS,
  BUILD_FAQ,
} from "../../../src/lib/build/landing-content";
import { SKILL_MD_MCP_URL, SKILL_MD_KEYS_PATH, buildSkillMd } from "../../../src/lib/build/skill-md";

describe("/build landing content", () => {
  test("the hero command is the one-line SKILL.md set-up funnel", () => {
    assert.match(BUILD_SETUP_COMMAND, /^set up https:\/\/seldonframe\.com\/SKILL\.md$/);
    // Same command the SKILL.md doc itself documents — one funnel, two surfaces.
    assert.ok(buildSkillMd().includes(BUILD_SETUP_COMMAND));
  });

  test("the MCP origin + key path match SKILL.md (no cross-surface drift)", () => {
    assert.equal(BUILD_MCP_URL, SKILL_MD_MCP_URL);
    assert.equal(BUILD_KEYS_PATH, SKILL_MD_KEYS_PATH);
    assert.match(BUILD_MCP_URL, /^https:\/\/mcp\.seldonframe\.com/);
    assert.equal(BUILD_WALLET_PATH, "/build/wallet");
  });

  test("the builder split is 95/5 and stated consistently", () => {
    assert.equal(BUILDER_KEEP_PCT, 95);
    assert.equal(SELDONFRAME_FEE_PCT, 5);
  });

  test("the consumption story is discover -> inspect -> run, in order, each with a price note", () => {
    assert.deepEqual(
      FLOW_STEPS.map((s) => s.key),
      ["discover", "inspect", "run"],
    );
    // The price/billing honesty must surface across the three cards.
    const joined = FLOW_STEPS.map((s) => `${s.title} ${s.body}`).join(" ").toLowerCase();
    assert.match(joined, /price/);
    assert.match(joined, /never charged|errors/);
  });

  test("the three rentable types are Tools, Skills, Agents — Tools is the 1000+ surface (no vendor name)", () => {
    assert.deepEqual(
      RENTABLE_TYPES.map((t) => t.name),
      ["Tools", "Skills", "Agents"],
    );
    const tools = RENTABLE_TYPES.find((t) => t.name === "Tools");
    assert.ok(tools);
    assert.match(tools.count, /1000\+/);
    // 2026-06-30 — Max's call: the builder page states "1000+ tools", not the
    // upstream vendor. Lock that the vendor name never leaks onto /build (or its
    // .md twin, which renders the same RENTABLE_TYPES).
    assert.doesNotMatch(`${tools.count} ${tools.body}`, /composio/i);
  });

  test("the IDE chat shows the realistic build-and-list ask + the real tool chain", () => {
    const you = IDE_CHAT.find((t) => t.role === "you");
    assert.ok(you, "there is a user turn");
    assert.match(you.text.toLowerCase(), /receptionist/);
    assert.match(you.text, /\$0\.10\/call|0\.10/);
    assert.deepEqual(IDE_TOOL_CHAIN, [
      "create_agent",
      "run_agent_evals",
      "publish_agent",
      "set_usage_price",
    ]);
  });

  test("the connect snippet is the shared `claude mcp add` command with a wst_ placeholder", () => {
    const snippet = buildLandingConnectSnippet();
    assert.match(snippet, /claude mcp add seldonframe/);
    assert.match(snippet, /--transport http/);
    assert.ok(snippet.includes(BUILD_MCP_URL));
    assert.ok(snippet.includes(KEY_PLACEHOLDER));
    assert.match(KEY_PLACEHOLDER, /^wst_/);
    assert.match(snippet, /Authorization: Bearer/);
  });

  test("pricing points are money-honest + low-key: free to list, no upfront, 5% on usage only, errors free", () => {
    // The framing leads with the builder's win (free, no upfront) and states the
    // fee plainly as a clean 5% on usage — WITHOUT making "keep 95%" the headline
    // (that emphasis moved off the page per the 2026-06-30 low-key pricing pass).
    const joined = PRICING_POINTS.map((p) => p.text).join(" ").toLowerCase();
    assert.match(joined, /listing is free|free to list/);
    assert.match(joined, /no subscription/);
    assert.match(joined, /no upfront cost|nothing upfront/);
    assert.match(joined, /5%/);
    assert.match(joined, /errored runs are never charged|never charged/);
  });

  test("the FAQ is the low-key home for the fee + the full build/test/eval/observe toolchain", () => {
    // Bottom-of-page "common questions" (Monid register): the 5% fee is a plain
    // factual line here, not a headline. AND it pins the truth that SeldonFrame is
    // a full toolchain — test (send_conversation_turn), eval (run_agent_evals),
    // observe (tail_agent_conversations), and a Brain that learns — not just
    // build → list → run.
    assert.ok(BUILD_FAQ.length >= 4, "the FAQ has real questions");
    const joined = BUILD_FAQ.map((f) => `${f.q} ${f.a}`).join(" ").toLowerCase();
    assert.match(joined, /5%/, "the fee is stated in the FAQ");
    assert.match(joined, /only when a run succeeds|never billed|never charged/);
    assert.match(joined, /send_conversation_turn/, "test-a-turn is surfaced");
    assert.match(joined, /run_agent_evals/, "evals are surfaced");
    assert.match(joined, /tail_agent_conversations|replay_conversation/, "logs/observability surfaced");
    assert.match(joined, /brain/, "the Brain-learns loop is surfaced");
  });

  test("content arrays are non-empty (the page has something to render)", () => {
    assert.ok(FLOW_STEPS.length === 3);
    assert.ok(RENTABLE_TYPES.length === 3);
    assert.ok(IDE_CHAT.length >= 2);
    assert.ok(PRICING_POINTS.length >= 3);
    assert.ok(BUILD_FAQ.length >= 4);
  });
});
