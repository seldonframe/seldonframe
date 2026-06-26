// /ai-agents Markdown renderers — pure, fed the SAME registry (AgentJob +
// Vertical + composePageCopy) the HTML /ai-agents pages render. These tests lock
// the clean output shape (index: H1 + intro + one bullet per job; a page: H1 +
// answer intro + the CITED stat with its source + what-it-does + how-it-works +
// details + FAQ + deploy link), the single-source-of-truth guarantees (the FAQ
// is composePageCopy's job-FAQ + value-frame, the stat carries its real source,
// vertical copy localizes), and absolute on-brand links.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  renderAiAgentsIndexMarkdown,
  renderAiAgentJobMarkdown,
  renderAiAgentJobVerticalMarkdown,
} from "../../../src/lib/marketplace/render-ai-agents-markdown";
import type { AgentJob, Vertical } from "../../../src/lib/seo/agent-pages";

const BASE = "https://seldonframe.com";

/** Minimal AgentJob fixture (override only what a test cares about). Mirrors the
 *  registry shape so the renderer exercises the same fields the pages read. */
function job(overrides: Partial<AgentJob> = {}): AgentJob {
  return {
    slug: "ai-receptionist",
    name: "AI Receptionist",
    h1: "AI Receptionist — answer every call, book every job",
    oneLiner: "A voice agent that picks up on the first ring and books the job.",
    verticalLede:
      "picks up on the first ring around the clock and books the job",
    painStat: {
      text: "An estimated 62% of calls to small businesses go unanswered.",
      source: "BrightLocal / industry reporting",
      url: "https://www.brightlocal.com/research/",
    },
    whatItDoes: ["Answers inbound calls on the first ring.", "Books the appointment."],
    howItWorks: [
      { label: "Your phone rings", detail: "A call comes in." },
      { label: "The agent answers", detail: "It greets and checks your calendar." },
      { label: "The job gets booked", detail: "It books and texts a confirmation." },
    ],
    tools: [
      { name: "Phone / SIP", mark: "phone" },
      { name: "Google Calendar", mark: "google-calendar" },
    ],
    faq: [
      { q: "How does it answer my calls?", a: "It connects to your line and answers in a natural voice." },
      { q: "Will it book appointments?", a: "Yes, it books into your real calendar." },
    ],
    surfaces: ["voice", "sms"],
    canonicalAgentSlug: "ai-phone-receptionist",
    canonicalKind: "starter",
    marketplaceSlug: "receptionist",
    mcpToolHint: "ask the receptionist to answer a caller and book an appointment",
    ...overrides,
  };
}

/** Minimal Vertical fixture. */
function vertical(overrides: Partial<Vertical> = {}): Vertical {
  return {
    slug: "plumbers",
    name: "plumber",
    plural: "plumbers",
    painHook: "a burst pipe at 2am won't leave a voicemail",
    exampleService: "emergency leak repair",
    ...overrides,
  };
}

describe("renderAiAgentsIndexMarkdown", () => {
  test("renders H1, intro, and one bullet per job with name + one-liner + link", () => {
    const md = renderAiAgentsIndexMarkdown(
      [
        job({ slug: "ai-receptionist", name: "AI Receptionist", oneLiner: "Answers every call." }),
        job({ slug: "google-review-agent", name: "Google Review Agent", oneLiner: "Turns jobs into reviews." }),
      ],
      BASE,
    );

    assert.match(md, /^# AI agents that work 24\/7 for your business/);
    assert.match(md, /Pick the job you need done\./);
    assert.match(md, /## Agents \(2\)/);
    assert.match(
      md,
      /- \[AI Receptionist\]\(https:\/\/seldonframe\.com\/ai-agents\/ai-receptionist\) — Answers every call\./,
    );
    assert.match(
      md,
      /- \[Google Review Agent\]\(https:\/\/seldonframe\.com\/ai-agents\/google-review-agent\) — Turns jobs into reviews\./,
    );
    assert.match(md, /Browse the full agent library: https:\/\/seldonframe\.com\/ai-agents/);
  });

  test("preserves the caller's order (does not re-sort)", () => {
    const md = renderAiAgentsIndexMarkdown(
      [job({ slug: "b", name: "Bravo" }), job({ slug: "a", name: "Alpha" })],
      BASE,
    );
    assert.ok(md.indexOf("Bravo") < md.indexOf("Alpha"), "input order preserved");
  });

  test("empty registry renders a clean, non-broken placeholder", () => {
    const md = renderAiAgentsIndexMarkdown([], BASE);
    assert.match(md, /^# AI agents that work 24\/7/);
    assert.match(md, /No agents are published yet\./);
    assert.doesNotMatch(md, /## Agents/);
  });

  test("defaults to the seldonframe.com base when none is passed", () => {
    const md = renderAiAgentsIndexMarkdown([job({ slug: "x", name: "X" })]);
    assert.match(md, /\(https:\/\/seldonframe\.com\/ai-agents\/x\)/);
  });
});

describe("renderAiAgentJobMarkdown (Tier-1)", () => {
  test("renders H1, intro, the cited stat WITH its source, sections, and the deploy link", () => {
    const md = renderAiAgentJobMarkdown(job(), BASE);

    // H1 is the job's own h1 (Tier-1, no vertical).
    assert.match(md, /^# AI Receptionist — answer every call, book every job/);
    // The cited stat as a blockquote with the source linked (the GEO payload).
    assert.match(md, /> "An estimated 62% of calls to small businesses go unanswered\."/);
    assert.match(
      md,
      /> — Source: \[BrightLocal \/ industry reporting\]\(https:\/\/www\.brightlocal\.com\/research\/\)/,
    );
    // What-it-does bullets.
    assert.match(md, /## What an AI Receptionist does/);
    assert.match(md, /- Answers inbound calls on the first ring\./);
    // How it works (numbered).
    assert.match(md, /## How it works/);
    assert.match(md, /1\. \*\*Your phone rings\*\* — A call comes in\./);
    // Details: channels + tools.
    assert.match(md, /\*\*Channels:\*\* Voice \+ SMS/);
    assert.match(md, /\*\*Works with:\*\* Phone \/ SIP, Google Calendar/);
    // Deploy link (the close ends in a deployment, not a how-to).
    assert.match(
      md,
      /Deploy this agent into your own workspace in about 60 seconds: https:\/\/seldonframe\.com\/ai-agents\/ai-receptionist/,
    );
  });

  test("FAQ is the job FAQ PLUS the shared value-frame block (composePageCopy)", () => {
    const md = renderAiAgentJobMarkdown(job(), BASE);
    assert.match(md, /## Frequently asked questions/);
    // The job's own question.
    assert.match(md, /### How does it answer my calls\?/);
    // A value-frame question (appended by composePageCopy for every page).
    assert.match(md, /### How much does it cost\?/);
    // The real pricing fact carried in the value-frame answer.
    assert.match(md, /\$29\/mo flat/);
  });

  test("rent-via-MCP hint + marketplace cross-link render when a listing exists", () => {
    const md = renderAiAgentJobMarkdown(job({ marketplaceSlug: "receptionist" }), BASE);
    assert.match(md, /Prefer to rent it over MCP\? Ask the receptionist/);
    assert.match(
      md,
      /See this agent on the SeldonFrame Marketplace: https:\/\/seldonframe\.com\/marketplace\/receptionist/,
    );
  });

  test("no marketplace cross-link when the job has no listing", () => {
    const md = renderAiAgentJobMarkdown(job({ marketplaceSlug: undefined }), BASE);
    assert.doesNotMatch(md, /See this agent on the SeldonFrame Marketplace/);
    // The rent hint still renders (it's generic).
    assert.match(md, /Prefer to rent it over MCP\?/);
  });

  test("related-agents flywheel lists OTHER jobs as Tier-1 links", () => {
    // relatedJobsForVertical pulls from the REAL registry; assert the section
    // exists and links are Tier-1 (no /for/ segment) on a Tier-1 page.
    const md = renderAiAgentJobMarkdown(job({ slug: "ai-receptionist" }), BASE);
    assert.match(md, /## More agents for your business/);
    assert.doesNotMatch(md, /\/for\//); // Tier-1 links never carry a vertical
  });
});

describe("renderAiAgentJobVerticalMarkdown (Tier-2)", () => {
  test("H1 + intro localize to the trade; the stat + sections still render", () => {
    const md = renderAiAgentJobVerticalMarkdown(job(), vertical(), BASE);

    // Tier-2 H1 is "<job> for <Plural>".
    assert.match(md, /^# AI Receptionist for Plumbers/);
    // The intro weaves the vertical pain hook + plural.
    assert.match(md, /For plumbers,/);
    // Industry line in Details.
    assert.match(md, /\*\*Industry:\*\* plumbers/);
    // The cited stat is still present with its source.
    assert.match(md, /> "An estimated 62% of calls/);
    assert.match(md, /> — Source: \[BrightLocal/);
  });

  test("deploy link + related links carry the vertical (/for/<vertical>)", () => {
    const md = renderAiAgentJobVerticalMarkdown(job({ slug: "ai-receptionist" }), vertical({ slug: "plumbers" }), BASE);
    assert.match(
      md,
      /Deploy this agent .*: https:\/\/seldonframe\.com\/ai-agents\/ai-receptionist\/for\/plumbers/,
    );
    // The flywheel section is localized + the links deep-link to the same vertical.
    assert.match(md, /## More agents for plumbers/);
    assert.match(md, /\/ai-agents\/[a-z-]+\/for\/plumbers\)/);
  });

  test("the first FAQ question is localized to the trade (composePageCopy)", () => {
    const md = renderAiAgentJobVerticalMarkdown(job(), vertical(), BASE);
    // composePageCopy appends "(for <plural>)" to the first job FAQ question.
    assert.match(md, /### How does it answer my calls\? \(for plumbers\)/);
    // The value-frame block is still appended unchanged.
    assert.match(md, /### How much does it cost\?/);
  });
});
