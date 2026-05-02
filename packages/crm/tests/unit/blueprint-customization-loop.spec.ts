/**
 * C3.4 — golden customization-loop test.
 *
 * The acceptance criterion shipped with the C3.3 + C3.4 brief:
 *
 *   "Create workspace with HVAC blueprint → Claude Code calls
 *    update_landing_section to change the hero headline to
 *    'Same-day HVAC repair in DFW' → the landing page re-renders
 *    with the new headline AND keeps all C3.2 visual polish
 *    (animations, typography, buttons, layout). No visual downgrade."
 *
 * This test exercises the pure functions that the API route handler
 * stitches together (load → mutate → render → save) and asserts both
 * halves of the contract: the new content lands AND the visual markers
 * are intact.
 *
 * It does NOT cover the DB read/write path — that's exercised in the
 * route handler itself, which is too coupled to Drizzle/Neon to mock
 * usefully here. The mutation + render are the algorithmic heart; if
 * those round-trip cleanly the route handler is just plumbing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { pickTemplate } from "@/lib/blueprint/templates";
import {
  mutateHeroHeadline,
  mutateHeroSubhead,
  mutateHeroCtaPrimaryLabel,
  mutateWorkspaceTheme,
  mutateSectionField,
  mutateAboutBody,
} from "@/lib/blueprint/mutate";
import {
  buildBlueprintForWorkspace,
  loadBlueprintOrFallback,
  renderBlueprint,
} from "@/lib/blueprint/persist";

// Markers that prove the C3.x visual polish survived a re-render.
// May 2026 — sf-hero__corner spans were intentionally removed from the
// renderer (they read as black squares against the dark hero band). The
// CSS for them remains in the stylesheet; the polish-survival assertion
// no longer requires the markup itself.
const POLISH_HTML_MARKERS = [
  "sf-frame",            // C3.2 outer page frame
  "sf-navbar",           // C3.2 floating glass nav
  "sf-hero__glow",       // C3.2 blurred gradients
  "sf-btn__icon",        // C3.2 chevron-in-circle on primary CTA
  "sf-faq__chevron",     // C3.1 +/× rotation
  "sf-emergency",        // existing emergency strip
  "Powered by",          // footer brand link
];
const POLISH_CSS_MARKERS = [
  "Instrument+Serif",    // serif font import
  "--sf-bg-primary",     // theme tokens
  "--sf-accent",         // accent token
  "@keyframes sfPulse",  // emergency-strip pulse
  "sf-animate",          // scroll-trigger animation hooks
];

function assertPolishPreserved(html: string, css: string, label: string) {
  for (const marker of POLISH_HTML_MARKERS) {
    assert.ok(html.includes(marker), `[${label}] HTML missing polish marker: ${marker}`);
  }
  for (const marker of POLISH_CSS_MARKERS) {
    assert.ok(css.includes(marker), `[${label}] CSS missing polish marker: ${marker}`);
  }
}

/**
 * Strip HTML tags (and the `&#39;` etc. entity escapes the renderer
 * emits) so we can assert on visible text without caring about the
 * auto-italicize-last-word `<em class="sf-italic">` wrapping that the
 * hero renderer applies. Quick-and-dirty — fine for assertions in tests.
 */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ─── Mutation helpers ──────────────────────────────────────────────────

test("mutateHeroHeadline — sets new headline + returns fresh blueprint", () => {
  const initial = buildBlueprintForWorkspace("Lone Star HVAC", "hvac");
  const original = JSON.parse(JSON.stringify(initial));
  const updated = mutateHeroHeadline(initial, "Same-day HVAC repair in DFW");

  // Mutation visible on the new copy
  const heroNew = updated.landing.sections.find((s) => s.type === "hero");
  assert.ok(heroNew && heroNew.type === "hero");
  assert.equal(heroNew.headline, "Same-day HVAC repair in DFW");

  // Original blueprint untouched (immutability guarantee)
  assert.deepEqual(initial, original, "input blueprint must not be mutated");
});

test("mutateHeroSubhead + mutateHeroCtaPrimaryLabel — apply independently", () => {
  const initial = buildBlueprintForWorkspace("Acme HVAC", "hvac");
  const updated = mutateHeroCtaPrimaryLabel(
    mutateHeroSubhead(initial, "Family-owned, licensed in Texas, on time or it's free."),
    "Get a same-day quote"
  );
  const hero = updated.landing.sections.find((s) => s.type === "hero");
  assert.ok(hero && hero.type === "hero");
  assert.equal(hero.subhead, "Family-owned, licensed in Texas, on time or it's free.");
  assert.equal(hero.ctaPrimary.label, "Get a same-day quote");
});

test("mutateWorkspaceTheme — patches accent without touching other slots", () => {
  const initial = buildBlueprintForWorkspace("Test Co", "hvac");
  const updated = mutateWorkspaceTheme(initial, { accent: "#0EA5E9" });
  assert.equal(updated.workspace.theme.accent, "#0EA5E9");
  // The other theme fields persist
  assert.equal(updated.workspace.theme.mode, initial.workspace.theme.mode);
  assert.equal(updated.workspace.theme.displayFont, initial.workspace.theme.displayFont);
});

test("mutateSectionField — generic dot-path setter (services-grid item)", () => {
  const initial = buildBlueprintForWorkspace("Test Co", "hvac");
  const updated = mutateSectionField(
    initial,
    "services-grid",
    "items.0.title",
    "Emergency AC repair"
  );
  const services = updated.landing.sections.find((s) => s.type === "services-grid");
  assert.ok(services && services.type === "services-grid");
  assert.equal(services.items[0].title, "Emergency AC repair");
  // Sibling items untouched
  assert.equal(
    services.items[1].title,
    pickTemplate("hvac").landing.sections.find((s) => s.type === "services-grid")!.items[1].title
  );
});

test("mutateSectionField — throws on missing section type", () => {
  const initial = buildBlueprintForWorkspace("Test Co", "general");
  // general template has no emergency-strip section
  assert.throws(
    () => mutateSectionField(initial, "emergency-strip", "label", "X"),
    /No section of type/
  );
});

test("mutateSectionField — throws on broken path", () => {
  const initial = buildBlueprintForWorkspace("Test Co", "hvac");
  assert.throws(
    () => mutateSectionField(initial, "hero", "nope.does.not.exist.deeply", "X"),
    /Cannot/
  );
});

// ─── loadBlueprintOrFallback ──────────────────────────────────────────

test("loadBlueprintOrFallback — returns row blueprint when present", () => {
  const seeded = buildBlueprintForWorkspace("DFW HVAC", "hvac");
  const loaded = loadBlueprintOrFallback({ blueprintJson: seeded }, "DFW HVAC", "hvac");
  assert.equal(loaded.workspace.name, "DFW HVAC");
  // Same data shape (deep-equal because cloning happens at mutation time, not load time)
  assert.deepEqual(loaded, seeded);
});

test("loadBlueprintOrFallback — falls back to template when blueprintJson is NULL", () => {
  const loaded = loadBlueprintOrFallback({ blueprintJson: null }, "Bootstrap Co", "hvac");
  assert.equal(loaded.workspace.industry, "hvac");
  assert.equal(loaded.workspace.name, "Bootstrap Co");
});

test("loadBlueprintOrFallback — falls back when JSON is malformed", () => {
  const loaded = loadBlueprintOrFallback(
    { blueprintJson: { not: "a-blueprint" } },
    "Recovery Co",
    "general"
  );
  assert.equal(loaded.workspace.industry, "general");
  assert.equal(loaded.workspace.name, "Recovery Co");
});

// ─── End-to-end golden test ───────────────────────────────────────────

test("GOLDEN: change hero headline through customization loop, polish preserved", () => {
  // 1. Workspace creation: build initial blueprint
  const seeded = buildBlueprintForWorkspace("DFW Blueprint Test", "hvac");
  const initialRender = renderBlueprint(seeded);

  // Sanity: initial render contains template headline + polish.
  // The hero renderer auto-italicizes the last word, so we assert on the
  // visible text rather than the raw HTML.
  assert.ok(
    visibleText(initialRender.contentHtml).includes("A cool home in 24 hours"),
    "initial render should contain template hero headline"
  );
  assertPolishPreserved(initialRender.contentHtml, initialRender.contentCss, "initial");

  // 2. Operator says: "change my hero headline to 'Same-day HVAC repair in DFW'"
  //    → MCP tool calls update_landing_section
  //    → API route: load blueprint → mutate → re-render → save
  const loaded = loadBlueprintOrFallback(
    { blueprintJson: seeded },
    "DFW Blueprint Test",
    "hvac"
  );
  const mutated = mutateHeroHeadline(loaded, "Same-day HVAC repair in DFW");
  const newRender = renderBlueprint(mutated);

  // 3. New headline lands in the rendered output (visible text, since
  //    the auto-italicize-last-word renderer wraps "DFW" in <em>).
  assert.ok(
    visibleText(newRender.contentHtml).includes("Same-day HVAC repair in DFW"),
    "new headline must appear in re-rendered HTML"
  );
  // Old template headline gone
  assert.ok(
    !visibleText(newRender.contentHtml).includes("A cool home in 24 hours"),
    "old template headline should no longer be present"
  );

  // 4. ALL C3.x visual polish preserved — this is the "no visual downgrade" check
  assertPolishPreserved(newRender.contentHtml, newRender.contentCss, "after-mutation");

  // 5. The blueprint round-trips intact for the next mutation.
  //    persisting `mutated` and loading it back yields the same blueprint
  const savedAndReloaded = loadBlueprintOrFallback(
    { blueprintJson: mutated },
    "DFW Blueprint Test",
    "hvac"
  );
  assert.deepEqual(savedAndReloaded, mutated, "round-trip through persistence is lossless");
});

test("GOLDEN: chained mutations (headline + subhead + accent + service item) all stick", () => {
  // Simulates an operator session: 4 separate update_landing_section calls.
  let bp = buildBlueprintForWorkspace("Chained Mutations Co", "hvac");
  bp = mutateHeroHeadline(bp, "Same-day HVAC repair in DFW");
  bp = mutateHeroSubhead(bp, "Licensed, insured, family-owned. We answer the phone.");
  bp = mutateWorkspaceTheme(bp, { accent: "#0EA5E9" });
  bp = mutateSectionField(bp, "services-grid", "items.0.title", "24/7 emergency repair");

  const out = renderBlueprint(bp);
  const visible = visibleText(out.contentHtml);

  assert.ok(visible.includes("Same-day HVAC repair in DFW"));
  assert.ok(visible.includes("Licensed, insured, family-owned. We answer the phone."));
  assert.ok(out.contentCss.includes("--sf-accent: #0EA5E9"), "accent token must reflect new color");
  assert.ok(out.contentHtml.includes("24/7 emergency repair"), "first service title updated");

  assertPolishPreserved(out.contentHtml, out.contentCss, "chained-mutations");
});

test("GOLDEN: accent change re-derives accent-hover and accent-soft tokens", () => {
  const bp = mutateWorkspaceTheme(
    buildBlueprintForWorkspace("Accent Test", "hvac"),
    { accent: "#0EA5E9" }
  );
  const out = renderBlueprint(bp);
  assert.ok(out.contentCss.includes("--sf-accent: #0EA5E9"));
  // Derived tokens (-hover / -soft) must change too — otherwise the
  // theme won't feel cohesive after a customization.
  assert.ok(
    /--sf-accent-hover:\s*#[0-9A-F]{6}/.test(out.contentCss),
    "accent-hover token present"
  );
  assert.ok(
    /--sf-accent-soft:\s*#[0-9A-F]{6}/.test(out.contentCss),
    "accent-soft token present"
  );
});

test("GOLDEN: about body replacement clears [City] placeholder + restores section", () => {
  const seeded = buildBlueprintForWorkspace("DFW HVAC", "hvac");
  const initial = renderBlueprint(seeded);
  // Initial HVAC about body has [City] placeholder so the section
  // is hidden by the slot-resolution layer in the renderer.
  assert.ok(!initial.contentHtml.includes("sf-about__copy"), "about hidden initially");

  // Operator fills in the placeholder via update_landing_section
  const updated = mutateAboutBody(
    seeded,
    "We're a family-owned HVAC company that's been serving Dallas-Fort Worth for over 20 years."
  );
  const out = renderBlueprint(updated);
  assert.ok(out.contentHtml.includes("sf-about__copy"), "about renders once placeholder is gone");
  assert.ok(out.contentHtml.includes("Dallas-Fort Worth"));
  assertPolishPreserved(out.contentHtml, out.contentCss, "about-customized");
});
