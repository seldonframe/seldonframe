// 2026-05-22 — Public chatbot widget (embed.js) brand-awareness.
//
// The floating chat bubble served via
//   /api/v1/public/agent/<orgSlug>--<agentSlug>/embed.js
// used to inherit only `theme.primaryColor` from the workspace, with a
// hardcoded #111111 fallback and a hardcoded Inter font stack. That
// meant a "bold-urgency" plumbing workspace got the same teal bubble
// as a "clinical-trust" dental office.
//
// `getArchetypeStyleTokens(slug)` projects a stored archetype id onto
// the embed-ready palette + fonts. The route then threads these tokens
// into the IIFE config so the CSS template stamps the right colors +
// fonts into the bubble + panel.
//
// Invariants under test:
//   1. Known archetype id → its palette + fonts (no surprises in projection)
//   2. null / undefined / unknown id → SeldonFrame default tokens
//   3. Default tokens preserve the pre-archetype #111111 primary so
//      workspaces that haven't run the v1.54 archetype backfill don't
//      visually shift on rollout.
//   4. Google Fonts URL builder allowlist — Geist + Outfit emit a URL,
//      Cabinet Grotesk + Satoshi (Fontshare) are skipped (system fallback).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ARCHETYPES,
  SELDONFRAME_DEFAULT_TOKENS,
  buildEmbedGoogleFontUrl,
  getArchetypeStyleTokens,
} from "../../src/lib/workspace/aesthetic-archetypes";

describe("getArchetypeStyleTokens — projects archetype onto embed tokens", () => {
  test("bold-urgency → red primary + Outfit headline + Geist body", () => {
    const tokens = getArchetypeStyleTokens("bold-urgency");
    assert.equal(tokens.primary, ARCHETYPES["bold-urgency"].palette.primary);
    assert.equal(tokens.primary, "#cc2d2d", "bold-urgency primary is the strong red, NOT teal/#111");
    assert.equal(tokens.secondary, ARCHETYPES["bold-urgency"].palette.secondary);
    assert.equal(tokens.background, ARCHETYPES["bold-urgency"].palette.background);
    assert.equal(tokens.text, ARCHETYPES["bold-urgency"].palette.text);
    assert.equal(tokens.border, ARCHETYPES["bold-urgency"].palette.border);
    assert.equal(tokens.headlineFont, ARCHETYPES["bold-urgency"].fonts.headline);
    assert.equal(tokens.bodyFont, ARCHETYPES["bold-urgency"].fonts.body);
  });

  test("clinical-trust → deep navy primary (calm, not red)", () => {
    const tokens = getArchetypeStyleTokens("clinical-trust");
    assert.equal(tokens.primary, "#1e3a5f");
    assert.equal(tokens.primary, ARCHETYPES["clinical-trust"].palette.primary);
  });

  test("cinematic-aspirational → muted gold (NOT bold red)", () => {
    const tokens = getArchetypeStyleTokens("cinematic-aspirational");
    assert.equal(tokens.primary, "#a08562");
    assert.notEqual(tokens.primary, getArchetypeStyleTokens("bold-urgency").primary);
  });

  test("every known archetype id projects without throwing", () => {
    for (const id of Object.keys(ARCHETYPES)) {
      const tokens = getArchetypeStyleTokens(id);
      assert.ok(tokens.primary.startsWith("#"), `${id}: primary must be a hex token`);
      assert.ok(tokens.bodyFont.length > 0, `${id}: bodyFont must be a non-empty string`);
      assert.ok(tokens.headlineFont.length > 0, `${id}: headlineFont must be a non-empty string`);
    }
  });
});

describe("getArchetypeStyleTokens — fallback to SeldonFrame defaults", () => {
  test("null → SeldonFrame default tokens", () => {
    assert.deepEqual(getArchetypeStyleTokens(null), SELDONFRAME_DEFAULT_TOKENS);
  });

  test("undefined → SeldonFrame default tokens", () => {
    assert.deepEqual(getArchetypeStyleTokens(undefined), SELDONFRAME_DEFAULT_TOKENS);
  });

  test("empty string → SeldonFrame default tokens", () => {
    assert.deepEqual(getArchetypeStyleTokens(""), SELDONFRAME_DEFAULT_TOKENS);
  });

  test("unknown archetype id → SeldonFrame default tokens", () => {
    assert.deepEqual(
      getArchetypeStyleTokens("nonexistent-archetype"),
      SELDONFRAME_DEFAULT_TOKENS,
    );
  });

  test("default tokens preserve #111111 primary (legacy parity)", () => {
    // The pre-archetype embed used #111111 as the primary-color fallback.
    // Default tokens MUST match so workspaces without an archetype slug
    // (legacy workspaces, mid-creation states) don't visually shift.
    assert.equal(SELDONFRAME_DEFAULT_TOKENS.primary, "#111111");
  });

  test("default tokens use Geist (project default font)", () => {
    // DEFAULT_ORG_THEME.fontFamily is Geist per types.ts. The embed
    // default body font matches so legacy workspaces inherit the same
    // font stack the PublicThemeProvider uses.
    assert.equal(SELDONFRAME_DEFAULT_TOKENS.bodyFont, "Geist");
    assert.equal(SELDONFRAME_DEFAULT_TOKENS.headlineFont, "Geist");
  });
});

describe("buildEmbedGoogleFontUrl — Google Fonts allowlist", () => {
  test("Geist + Outfit (both Google) → single CSS2 URL", () => {
    const url = buildEmbedGoogleFontUrl("Outfit", "Geist");
    assert.ok(url, "expected a non-null URL");
    assert.ok(url!.startsWith("https://fonts.googleapis.com/css2?"), "uses Google Fonts CSS2 endpoint");
    assert.match(url!, /family=Outfit/);
    assert.match(url!, /family=Geist/);
    assert.match(url!, /display=swap/);
  });

  test("Cabinet Grotesk + Satoshi (both Fontshare) → null (system fallback)", () => {
    // Per the implementation boundary: Fontshare fonts are not injected
    // because they require a licensed CDN snippet. Embed falls through
    // to the system font stack — that's the intentional behavior.
    const url = buildEmbedGoogleFontUrl("Cabinet Grotesk", "Satoshi");
    assert.equal(url, null);
  });

  test("Cabinet Grotesk + Geist → URL containing only Geist", () => {
    // Mixed pair: Fontshare headline + Google body. Only the Google
    // half is loaded; the Fontshare headline falls back to system.
    const url = buildEmbedGoogleFontUrl("Cabinet Grotesk", "Geist");
    assert.ok(url, "Google body alone should still emit a URL");
    assert.match(url!, /family=Geist/);
    assert.doesNotMatch(url!, /Cabinet/);
  });

  test("Anton + Inter (bold-urgency-style) → URL with both families", () => {
    const url = buildEmbedGoogleFontUrl("Anton", "Inter");
    assert.ok(url);
    assert.match(url!, /family=Anton/);
    assert.match(url!, /family=Inter/);
  });

  test("Playfair Display + Inter → URL with both, spaces encoded as +", () => {
    const url = buildEmbedGoogleFontUrl("Playfair Display", "Inter");
    assert.ok(url);
    assert.match(url!, /family=Playfair\+Display/);
    assert.match(url!, /family=Inter/);
  });

  test("unknown font names → null", () => {
    assert.equal(buildEmbedGoogleFontUrl("NotARealFont", "AnotherFake"), null);
  });

  test("same font for headline + body → single family in URL (deduplicated)", () => {
    const url = buildEmbedGoogleFontUrl("Geist", "Geist");
    assert.ok(url);
    const familyMatches = url!.match(/family=Geist/g) ?? [];
    assert.equal(familyMatches.length, 1, "Geist should appear once, not twice");
  });
});
