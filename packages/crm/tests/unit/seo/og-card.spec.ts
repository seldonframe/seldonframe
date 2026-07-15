// lib/seo/og-card.tsx — the shared design module for the per-page Open Graph
// image endpoint (app/api/og/route.tsx). This spec pins the PURE parts:
// param clamping, short-price extraction, and the OG URL builder — the
// endpoint itself renders via ImageResponse/satori, which this harness
// can't exercise, so the layout components are exercised only indirectly
// (React.createElement must not throw) while the helpers get real assertions.
// Also verifies the two committed font binaries are valid, non-empty TTFs.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  buildOgUrl,
  clamp,
  clampEllipsis,
  shortPrice,
  AgentShareCard,
  AltCard,
  BestCard,
  DefaultCard,
  SfVsCard,
  ToolCard,
  VsCard,
} from "../../../src/lib/seo/og-card";

// Minimal element-tree walker for the layout components: expands function
// components (they're pure — no hooks/state) and collects every text node
// with its nearest inherited `style.color` AND nearest ancestor
// `style.backgroundColor` (so a pill's text is judged against the pill's own
// fill, not the card behind it). This lets us assert VISIBILITY (text color
// ≠ surface behind it), which is how the tool-card hook regressed in the
// forest rebrand: the hook was still rendered, but in green #1F2B24 on a
// #1F2B24 background.
type TextNode = { text: string; color: string | undefined; background: string | undefined };

type ElementLike = {
  type?: unknown;
  props?: { style?: { color?: string; backgroundColor?: string }; children?: unknown };
};

function collectTextNodes(
  node: unknown,
  inheritedColor: string | undefined,
  out: TextNode[],
  inheritedBackground?: string,
): void {
  if (node == null || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    out.push({ text: String(node), color: inheritedColor, background: inheritedBackground });
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectTextNodes(child, inheritedColor, out, inheritedBackground);
    return;
  }
  const el = node as ElementLike;
  if (typeof el.type === "function") {
    collectTextNodes((el.type as (props: unknown) => unknown)(el.props), inheritedColor, out, inheritedBackground);
    return;
  }
  const color = el.props?.style?.color ?? inheritedColor;
  const declaredBackground = el.props?.style?.backgroundColor;
  const background =
    declaredBackground && declaredBackground !== "transparent" ? declaredBackground : inheritedBackground;
  collectTextNodes(el.props?.children, color, out, background);
}

// Every host element that declares an opaque fill, paired with the nearest
// ancestor fill behind it — catches the non-text half of the green === dark
// trap (AccentBar, the BrandMark tile, filled pills vanishing on dark cards).
type FillNode = { background: string; parentBackground: string | undefined };

function collectFills(node: unknown, parentBackground: string | undefined, out: FillNode[]): void {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return;
  if (Array.isArray(node)) {
    for (const child of node) collectFills(child, parentBackground, out);
    return;
  }
  const el = node as ElementLike;
  if (typeof el.type === "function") {
    collectFills((el.type as (props: unknown) => unknown)(el.props), parentBackground, out);
    return;
  }
  const declared = el.props?.style?.backgroundColor;
  const isOpaqueFill = Boolean(declared) && declared !== "transparent";
  if (isOpaqueFill) out.push({ background: declared as string, parentBackground });
  collectFills(el.props?.children, isOpaqueFill ? (declared as string) : parentBackground, out);
}

/** Expand function components until the first host element and return its
 *  backgroundColor — the card's background. */
function rootBackground(node: unknown): string | undefined {
  let el = node as ElementLike;
  while (el && typeof el.type === "function") {
    el = (el.type as (props: unknown) => unknown)(el.props) as ElementLike;
  }
  return el?.props?.style?.backgroundColor;
}

describe("clamp", () => {
  test("returns the string unchanged when under the limit", () => {
    assert.equal(clamp("hello", 10), "hello");
  });

  test("hard-caps at maxLength", () => {
    assert.equal(clamp("a".repeat(20), 5).length, 5);
  });

  test("treats null/undefined as an empty string", () => {
    assert.equal(clamp(null, 10), "");
    assert.equal(clamp(undefined, 10), "");
  });

  test("strips control characters and newlines", () => {
    const withControl = "hello\nworld\x00\x1b[31m";
    assert.doesNotMatch(clamp(withControl, 50), /[\n\x00\x1b]/);
  });

  test("trims surrounding whitespace", () => {
    assert.equal(clamp("   padded   ", 20), "padded");
  });
});

describe("clampEllipsis", () => {
  test("returns the string unchanged when under the limit", () => {
    assert.equal(clampEllipsis("short", 10), "short");
  });

  test("truncates and appends an ellipsis when over the limit", () => {
    const result = clampEllipsis("this is a very long string indeed", 10);
    assert.ok(result.length <= 10);
    assert.ok(result.endsWith("…"));
  });

  test("never exceeds maxLength even with the ellipsis appended", () => {
    for (const len of [1, 2, 5, 22, 48]) {
      const result = clampEllipsis("x".repeat(100), len);
      assert.ok(result.length <= len, `expected length <= ${len}, got ${result.length}`);
    }
  });
});

describe("shortPrice", () => {
  test("extracts a simple flat monthly price", () => {
    assert.equal(shortPrice("$29/mo flat — unlimited workspaces"), "$29/mo");
  });

  test("extracts a ranged monthly price", () => {
    const result = shortPrice("$97–$497/mo + AI Employee $50–$97/mo per location");
    assert.ok(result.length <= 22);
    assert.match(result, /\$97-\$497\/mo/);
  });

  test("extracts a per-minute price", () => {
    const result = shortPrice("$0.05/min hosting + STT/LLM/TTS/telephony pass-through");
    assert.match(result, /\$0\.05\/min/);
  });

  test("recognizes quote-gated pricing", () => {
    assert.equal(shortPrice("Quote-gated pricing (reported ~$399–$599/mo base)"), "Quote-only");
    assert.equal(shortPrice("Quote-only; reported ~$399–$599/mo base"), "Quote-only");
  });

  test("falls back to a bare dollar amount when no unit is found", () => {
    const result = shortPrice("Starting at $16 for the basic plan");
    assert.match(result, /^\$16/);
  });

  test("falls back to a generic string when there is no dollar sign at all", () => {
    assert.equal(shortPrice(""), "Ask for pricing");
  });

  test("always returns a string no longer than 22 characters", () => {
    const inputs = [
      "$97–$497/mo + AI Employee $50–$97/mo per location + metered voice, SMS & email usage",
      "Minimum-spend tiers $99–$999/mo; 12-month contracts on Professional/Premium; extra seats & reports billed",
      "",
      "Free tier; ~$22–$95/mo; top plan capped at 5 businesses",
    ];
    for (const input of inputs) {
      assert.ok(shortPrice(input).length <= 22, `too long for input: ${input}`);
    }
  });
});

describe("buildOgUrl", () => {
  test("builds a sf-vs URL with kind, slug, name and price", () => {
    const url = buildOgUrl({ kind: "sf-vs", slug: "gohighlevel", name: "GoHighLevel", price: "$97/mo" });
    assert.match(url, /^\/api\/og\?/);
    const params = new URLSearchParams(url.split("?")[1]);
    assert.equal(params.get("kind"), "sf-vs");
    assert.equal(params.get("slug"), "gohighlevel");
    assert.equal(params.get("name"), "GoHighLevel");
    assert.equal(params.get("price"), "$97/mo");
  });

  test("builds a vs URL with a and b", () => {
    const url = buildOgUrl({ kind: "vs", a: "Vapi", b: "Retell AI" });
    const params = new URLSearchParams(url.split("?")[1]);
    assert.equal(params.get("kind"), "vs");
    assert.equal(params.get("a"), "Vapi");
    assert.equal(params.get("b"), "Retell AI");
  });

  test("builds an alt URL with slug, name and price", () => {
    const url = buildOgUrl({ kind: "alt", slug: "chatbase", name: "Chatbase", price: "$40/mo" });
    const params = new URLSearchParams(url.split("?")[1]);
    assert.equal(params.get("kind"), "alt");
    assert.equal(params.get("slug"), "chatbase");
  });

  test("builds a best URL with title, aud and n", () => {
    const url = buildOgUrl({ kind: "best", title: "Best CRMs", aud: "for Plumbers", n: 7 });
    const params = new URLSearchParams(url.split("?")[1]);
    assert.equal(params.get("kind"), "best");
    assert.equal(params.get("title"), "Best CRMs");
    assert.equal(params.get("aud"), "for Plumbers");
    assert.equal(params.get("n"), "7");
  });

  test("builds a tool URL with name and hook", () => {
    const url = buildOgUrl({ kind: "tool", name: "Missed Call Calculator", hook: "What do missed calls cost you?" });
    const params = new URLSearchParams(url.split("?")[1]);
    assert.equal(params.get("kind"), "tool");
    assert.equal(params.get("name"), "Missed Call Calculator");
  });

  test("URL-encodes special characters in params", () => {
    const url = buildOgUrl({ kind: "vs", a: "A & B", b: "C?D" });
    assert.doesNotMatch(url, /&B|C\?D/); // raw ampersand/question-mark not present unencoded
  });
});

describe("layout components render without throwing", () => {
  // These call React.createElement (JSX) but do NOT render to the DOM or
  // through satori — that would require ImageResponse, which this harness
  // can't exercise. This just proves each layout is a valid function
  // component that doesn't throw when constructing its element tree with
  // extreme/empty inputs (the values a public, unauthenticated GET route
  // must survive).
  test("SfVsCard handles empty and overlong input", () => {
    assert.doesNotThrow(() => SfVsCard({ name: "", price: "" }));
    assert.doesNotThrow(() => SfVsCard({ name: "x".repeat(200), price: "y".repeat(200) }));
  });

  test("VsCard handles empty and overlong input", () => {
    assert.doesNotThrow(() => VsCard({ a: "", b: "" }));
    assert.doesNotThrow(() => VsCard({ a: "x".repeat(200), b: "y".repeat(200) }));
  });

  test("AltCard handles empty and overlong input", () => {
    assert.doesNotThrow(() => AltCard({ name: "", price: "" }));
    assert.doesNotThrow(() => AltCard({ name: "x".repeat(200), price: "y".repeat(200) }));
  });

  test("BestCard handles empty and overlong input", () => {
    assert.doesNotThrow(() => BestCard({ title: "", aud: "", n: "" }));
    assert.doesNotThrow(() => BestCard({ title: "x".repeat(200), aud: "y".repeat(200), n: "z".repeat(200) }));
  });

  test("ToolCard handles empty and overlong input", () => {
    assert.doesNotThrow(() => ToolCard({ name: "", hook: "" }));
    assert.doesNotThrow(() => ToolCard({ name: "x".repeat(200), hook: "y".repeat(200) }));
  });

  test("DefaultCard renders with no input", () => {
    assert.doesNotThrow(() => DefaultCard());
  });
});

describe("tool-card hook renders VISIBLY", () => {
  // Regression: the forest rebrand set OG_COLORS.green = #1F2B24 — identical
  // to OG_COLORS.dark, the ToolCard background — so the hook line was drawn
  // in background-colored text and every live tool card showed no hook.
  // Presence in the tree is not enough; the color must differ from the
  // card's background.
  test("a provided hook appears in the tree with a color that differs from the background", () => {
    const hook = "What do missed calls cost you?";
    const card = ToolCard({ name: "Missed Call Calculator", hook });
    const background = rootBackground(card);
    assert.ok(background, "expected the card root to declare a backgroundColor");

    const texts: TextNode[] = [];
    collectTextNodes(card, undefined, texts);
    const hookNode = texts.find((t) => t.text === hook);
    assert.ok(hookNode, "hook text is missing from the rendered element tree");
    assert.ok(hookNode.color, "hook text has no explicit color");
    assert.notEqual(
      hookNode.color.toLowerCase(),
      background.toLowerCase(),
      `hook is rendered in the card's own background color (${background}) — invisible`,
    );
  });

  test("an overlong hook is ellipsized within the component cap", () => {
    const card = ToolCard({ name: "Free Tool", hook: "y".repeat(200) });
    const texts: TextNode[] = [];
    collectTextNodes(card, undefined, texts);
    const hookNode = texts.find((t) => t.text.startsWith("yyy"));
    assert.ok(hookNode, "clamped hook text missing from the tree");
    assert.ok(hookNode.text.length <= 70, `hook not clamped: ${hookNode.text.length} chars`);
    assert.ok(hookNode.text.endsWith("…"), "overlong hook should end with an ellipsis");
  });

  test("an empty hook renders no dangling hook element", () => {
    const card = ToolCard({ name: "Free Tool", hook: "" });
    const texts: TextNode[] = [];
    collectTextNodes(card, undefined, texts);
    // Only the name, the pill copy, and the brand mark should remain.
    assert.ok(texts.every((t) => t.text.trim().length > 0));
  });
});

describe("every card renders VISIBLY (blanket invariant)", () => {
  // Blanket version of the tool-card regression above: the forest rebrand
  // made OG_COLORS.green === OG_COLORS.dark, so ANY element styled `green`
  // on a dark card is drawn in background-colored ink — competitor names,
  // kickers, taglines, arrows, the accent bar, the brand tile, pill fills.
  // Invariant: no text node and no opaque fill on ANY card may share the
  // color of the surface directly behind it.
  const cards: Array<[string, ReturnType<typeof DefaultCard>]> = [
    ["SfVsCard", SfVsCard({ name: "GoHighLevel", price: "$97-$497/mo" })],
    ["VsCard", VsCard({ a: "Vapi", b: "Retell AI" })],
    ["AltCard", AltCard({ name: "Chatbase", price: "$40/mo" })],
    ["BestCard", BestCard({ title: "Best CRMs", aud: "for Plumbers", n: "7" })],
    ["ToolCard", ToolCard({ name: "Missed Call Calculator", hook: "What do missed calls cost you?" })],
    ["AgentShareCard", AgentShareCard({ name: "Intake Agent", steps: "Record|Extract|Deploy" })],
    ["DefaultCard", DefaultCard()],
  ];

  for (const [name, card] of cards) {
    test(`${name}: every text node has a color that differs from the surface behind it`, () => {
      const texts: TextNode[] = [];
      collectTextNodes(card, undefined, texts);
      assert.ok(texts.length > 0, "expected the card to contain text nodes");
      for (const t of texts) {
        assert.ok(t.color, `text "${t.text}" has no color (explicit or inherited)`);
        assert.ok(t.background, `text "${t.text}" has no surface behind it — CardFrame should always set one`);
        assert.notEqual(
          t.color.toLowerCase(),
          t.background.toLowerCase(),
          `text "${t.text}" is drawn in the color of the surface behind it (${t.background}) — invisible`,
        );
      }
    });

    test(`${name}: every opaque fill differs from the surface behind it`, () => {
      const fills: FillNode[] = [];
      collectFills(card, undefined, fills);
      for (const f of fills) {
        if (!f.parentBackground) continue; // the card root itself
        assert.notEqual(
          f.background.toLowerCase(),
          f.parentBackground.toLowerCase(),
          `an element is filled with its parent surface's own color (${f.background}) — invisible`,
        );
      }
    });
  }
});

describe("committed OG fonts are valid TTF binaries", () => {
  const fontsDir = path.join(__dirname, "../../../src/app/api/og/fonts");
  const files = ["Inter-Bold.ttf", "Inter-ExtraBold.ttf"];

  for (const file of files) {
    test(`${file} exists, is non-trivial in size, and starts with a valid TTF/OTF signature`, () => {
      const fullPath = path.join(fontsDir, file);
      const stat = statSync(fullPath);
      assert.ok(stat.size > 1000, `${file} is suspiciously small (${stat.size} bytes) — likely a bad download`);

      const buf = readFileSync(fullPath);
      const magic = buf.readUInt32BE(0);
      // Valid TrueType/OpenType sfnt version tags: 0x00010000 (TrueType),
      // 'OTTO' (0x4F54544F, CFF-flavored OpenType), or 'true'/'typ1' (rare
      // legacy Apple variants). rsms/inter ships TrueType outlines, so we
      // expect 0x00010000, but accept the other valid sfnt tags too.
      const validMagics = [0x00010000, 0x4f54544f, 0x74727565, 0x74797031];
      assert.ok(validMagics.includes(magic), `${file} has an invalid font magic: 0x${magic.toString(16)}`);
    });
  }

  test("total committed font payload stays within the 700KB budget", () => {
    const total = files.reduce((sum, file) => sum + statSync(path.join(fontsDir, file)).size, 0);
    assert.ok(total <= 700 * 1024, `fonts total ${total} bytes, over the 700KB budget`);
  });
});
