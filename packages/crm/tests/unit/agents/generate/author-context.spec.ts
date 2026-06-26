// Primitive-Composition Agent Generator — P5.3: the Soul-grounded author context.
//
// author-context.ts grounds the LLM author in the authoring workspace's business
// Soul so the authored skill is SPECIFIC, not generic. These tests pin the
// contract WITHOUT a DB: `getSoul` is dependency-injected as an in-memory fake.
//
// What's pinned:
//   • loadAuthorSoulContext — a fake store with a business profile → a compact
//     (≤600-char) non-empty summary that names the business + services + voice;
//     a store returning null/empty → ""; a THROWING store → "" (fail-soft); a
//     blank orgId / missing getSoul → "" (no read);
//   • summarizeSoulForAuthor — the pure condenser is hard-capped at 600 chars and
//     returns "" for a null soul;
//   • soulContextBlock — a non-empty summary → the labeled block + the "speak as
//     THIS business" instruction; "" → "".

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  loadAuthorSoulContext,
  summarizeSoulForAuthor,
  soulContextBlock,
  SOUL_SUMMARY_MAX_CHARS,
} from "../../../../src/lib/agents/generate/author-context";
import type { OrgSoul } from "../../../../src/lib/soul/types";

// ─── a minimal OrgSoul fixture ───────────────────────────────────────────────
//
// OrgSoul has ~20 fields; the summary only reads businessName / industry /
// offerType / businessDescription / services / voice.style. We build a partial
// and cast — the condenser tolerates missing fields (it reads each defensively),
// so a partial is a faithful stand-in for what the DB JSONB may actually hold.

function makeSoul(overrides: Partial<OrgSoul> = {}): OrgSoul {
  return {
    businessName: "Acme Plumbing",
    businessDescription: "We fix leaks, clogs, and water heaters 24/7 across the metro area.",
    industry: "plumbing",
    offerType: "Emergency repair and installation",
    voice: {
      style: "friendly, professional, no jargon",
      vocabulary: [],
      avoidWords: [],
      samplePhrases: [],
    },
    services: [
      { name: "Drain cleaning" },
      { name: "Water heater installation" },
      { name: "Leak repair" },
    ],
    ...overrides,
  } as OrgSoul;
}

/** A fake getSoul that returns a fixed value (or throws when asked). */
function fakeGetSoul(soul: OrgSoul | null): {
  getSoul: (orgId: string) => Promise<OrgSoul | null>;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    getSoul: async (orgId: string) => {
      calls.push(orgId);
      return soul;
    },
    calls,
  };
}

// ─── loadAuthorSoulContext — the fail-soft fetch ──────────────────────────────

describe("loadAuthorSoulContext — compact summary from an injected getSoul", () => {
  test("a business profile → a compact, non-empty summary (name + services + voice)", async () => {
    const { getSoul, calls } = fakeGetSoul(makeSoul());

    const summary = await loadAuthorSoulContext("org-123", { getSoul });

    assert.equal(calls.length, 1);
    assert.equal(calls[0], "org-123");
    assert.ok(summary.length > 0, "expected a non-empty summary");
    assert.ok(
      summary.length <= SOUL_SUMMARY_MAX_CHARS,
      `summary should be ≤ ${SOUL_SUMMARY_MAX_CHARS} chars, got ${summary.length}`,
    );
    // It names the business, a service, and the brand voice.
    assert.match(summary, /Acme Plumbing/);
    assert.match(summary, /plumbing/);
    assert.match(summary, /Drain cleaning/);
    assert.match(summary, /friendly, professional/);
  });

  test("a store returning null (new/empty org) → \"\"", async () => {
    const { getSoul } = fakeGetSoul(null);
    const summary = await loadAuthorSoulContext("org-123", { getSoul });
    assert.equal(summary, "");
  });

  test("a store returning an empty soul (no name, no content) → \"\"", async () => {
    const empty = { businessName: "", businessDescription: "" } as OrgSoul;
    const summary = await loadAuthorSoulContext("org-123", {
      getSoul: async () => empty,
    });
    assert.equal(summary, "");
  });

  test("a THROWING store → \"\" (fail-soft, never throws)", async () => {
    const summary = await loadAuthorSoulContext("org-123", {
      getSoul: async () => {
        throw new Error("db down");
      },
    });
    assert.equal(summary, "");
  });

  test("a blank orgId → \"\" without reading the store", async () => {
    const { getSoul, calls } = fakeGetSoul(makeSoul());
    const summary = await loadAuthorSoulContext("   ", { getSoul });
    assert.equal(summary, "");
    assert.equal(calls.length, 0); // never reached the store
  });

  test("a missing getSoul dep → \"\" (no throw)", async () => {
    // @ts-expect-error — deliberately omit the required dep to prove fail-soft.
    const summary = await loadAuthorSoulContext("org-123", {});
    assert.equal(summary, "");
  });
});

// ─── summarizeSoulForAuthor — the pure condenser ─────────────────────────────

describe("summarizeSoulForAuthor — pure, hard-capped condenser", () => {
  test("null/undefined soul → \"\"", () => {
    assert.equal(summarizeSoulForAuthor(null), "");
    assert.equal(summarizeSoulForAuthor(undefined), "");
  });

  test("the summary is hard-capped at the budget with an ellipsis", () => {
    // A soul whose fields blow well past the budget must be truncated.
    const huge = makeSoul({
      businessDescription: "x".repeat(2000),
      offerType: "y".repeat(2000),
    });
    const summary = summarizeSoulForAuthor(huge);
    assert.ok(
      summary.length <= SOUL_SUMMARY_MAX_CHARS,
      `expected ≤ ${SOUL_SUMMARY_MAX_CHARS}, got ${summary.length}`,
    );
    assert.match(summary, /…$/);
  });

  test("caps the number of named services and marks that more exist", () => {
    const many = makeSoul({
      services: [
        { name: "One" },
        { name: "Two" },
        { name: "Three" },
        { name: "Four" },
        { name: "Five" },
        { name: "Six" },
      ],
    });
    const summary = summarizeSoulForAuthor(many);
    // Only a few names + an ellipsis marker that more exist.
    assert.match(summary, /Services: One, Two, Three, Four, …\./);
    assert.ok(!summary.includes("Five"), "should not list every service");
  });

  test("works with only a name (degrades gracefully)", () => {
    const nameOnly = { businessName: "Solo Co" } as OrgSoul;
    const summary = summarizeSoulForAuthor(nameOnly);
    assert.match(summary, /Solo Co/);
    assert.ok(summary.length <= SOUL_SUMMARY_MAX_CHARS);
  });
});

// ─── soulContextBlock — the pure prompt renderer ─────────────────────────────

describe("soulContextBlock — the author prompt block", () => {
  test("a non-empty summary → the labeled block + the 'speak as THIS business' rule", () => {
    const block = soulContextBlock(
      "Acme Plumbing is a plumbing business. We fix leaks 24/7. Services: Drain cleaning.",
    );
    // Carries the summary verbatim…
    assert.match(block, /Acme Plumbing is a plumbing business/);
    assert.match(block, /Drain cleaning/);
    // …under the grounding label…
    assert.match(block, /The business you are authoring this agent for:/);
    // …with the explicit "speak/act as THIS business, no placeholders" instruction.
    assert.match(block, /speak and act as THIS business/);
    assert.match(block, /never generic placeholders/);
  });

  test("an empty / blank / nullish summary → \"\" (prompt unchanged → generic)", () => {
    assert.equal(soulContextBlock(""), "");
    assert.equal(soulContextBlock("   "), "");
    assert.equal(soulContextBlock(null), "");
    assert.equal(soulContextBlock(undefined), "");
  });
});
