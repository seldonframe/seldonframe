// /ai-agents Markdown path math — the pure helpers the proxy delegates to. These
// tests lock the M1 dotted-DYNAMIC-segment lesson: every PUBLIC `.md` URL maps to
// the STATIC `/ai-agents/listing.md?job=…&vertical=…` route's query (no `[job].md`
// bracket folder), and the static routes themselves (`/ai-agents.md`,
// `/ai-agents/listing.md`) are NOT treated as pages to rewrite (no loop).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  parseExplicitAiAgentMarkdownPath,
  negotiableAiAgentPage,
  AI_AGENTS_INDEX_MD_ROUTE,
  AI_AGENTS_LISTING_MD_ROUTE,
} from "../../../src/lib/http/ai-agents-md-paths";

describe("parseExplicitAiAgentMarkdownPath() — public .md URL → listing.md query", () => {
  test("Tier-1 /ai-agents/<job>.md → { job }", () => {
    assert.deepEqual(parseExplicitAiAgentMarkdownPath("/ai-agents/ai-receptionist.md"), {
      job: "ai-receptionist",
    });
  });

  test("Tier-2 /ai-agents/<job>/for/<vertical>.md → { job, vertical }", () => {
    assert.deepEqual(
      parseExplicitAiAgentMarkdownPath("/ai-agents/ai-receptionist/for/plumbers.md"),
      { job: "ai-receptionist", vertical: "plumbers" },
    );
  });

  test("the static index/listing routes are NOT explicit page .md URLs (no loop)", () => {
    assert.equal(parseExplicitAiAgentMarkdownPath(AI_AGENTS_INDEX_MD_ROUTE), null);
    assert.equal(parseExplicitAiAgentMarkdownPath(AI_AGENTS_LISTING_MD_ROUTE), null);
  });

  test("a non-.md page path is not an explicit Markdown URL", () => {
    assert.equal(parseExplicitAiAgentMarkdownPath("/ai-agents/ai-receptionist"), null);
    assert.equal(parseExplicitAiAgentMarkdownPath("/ai-agents/ai-receptionist/for/plumbers"), null);
    assert.equal(parseExplicitAiAgentMarkdownPath("/ai-agents"), null);
  });

  test("the route constants are the static (bracket-free) paths we expect", () => {
    // If these ever drift to a dotted DYNAMIC segment, typecheck would break —
    // pin them so the contract is explicit.
    assert.equal(AI_AGENTS_INDEX_MD_ROUTE, "/ai-agents.md");
    assert.equal(AI_AGENTS_LISTING_MD_ROUTE, "/ai-agents/listing.md");
  });
});

describe("negotiableAiAgentPage() — HTML page → {target, twin}", () => {
  test("Tier-1 page → target {job} + twin /ai-agents/<job>.md", () => {
    assert.deepEqual(negotiableAiAgentPage("/ai-agents/ai-receptionist"), {
      target: { job: "ai-receptionist" },
      twin: "/ai-agents/ai-receptionist.md",
    });
  });

  test("Tier-2 page → target {job, vertical} + nested twin", () => {
    assert.deepEqual(negotiableAiAgentPage("/ai-agents/ai-receptionist/for/plumbers"), {
      target: { job: "ai-receptionist", vertical: "plumbers" },
      twin: "/ai-agents/ai-receptionist/for/plumbers.md",
    });
  });

  test("the index is handled separately → null here", () => {
    assert.equal(negotiableAiAgentPage("/ai-agents"), null);
  });

  test("the static listing.md route is not a negotiable page", () => {
    assert.equal(negotiableAiAgentPage(AI_AGENTS_LISTING_MD_ROUTE), null);
  });

  test("a dotted final segment is NOT a negotiable HTML page (the .md branch owns it)", () => {
    // So `/ai-agents/<job>.md` never double-handles as both an explicit URL AND
    // a negotiable page — only the explicit branch claims it.
    assert.equal(negotiableAiAgentPage("/ai-agents/ai-receptionist.md"), null);
    assert.equal(negotiableAiAgentPage("/ai-agents/ai-receptionist/for/plumbers.md"), null);
  });

  test("an unrelated path is not a negotiable /ai-agents page", () => {
    assert.equal(negotiableAiAgentPage("/marketplace"), null);
    assert.equal(negotiableAiAgentPage("/ai-agents/a/b/c/d"), null);
  });
});
