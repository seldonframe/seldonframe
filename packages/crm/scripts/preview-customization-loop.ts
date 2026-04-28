/**
 * Preview script for the C3.4 customization loop. Renders the same
 * blueprint twice — once as it ships from the template (BEFORE), and
 * once after a chain of mutations equivalent to what an operator's
 * Claude Code session would call (AFTER) — and writes both to side-by-
 * side HTML files for visual QA.
 *
 * Critical proof: the two outputs should look identical from a polish
 * standpoint (same fonts, animations, layout, button styles, footer)
 * with only the operator-supplied copy differing. Anything else changing
 * is a regression.
 *
 * Usage (from packages/crm):
 *   pnpm tsx scripts/preview-customization-loop.ts
 */
import { writeFileSync } from "node:fs";
import {
  buildBlueprintForWorkspace,
  loadBlueprintOrFallback,
  renderBlueprint,
} from "../src/lib/blueprint/persist";
import {
  mutateHeroCtaPrimaryLabel,
  mutateHeroHeadline,
  mutateHeroSubhead,
  mutateSectionField,
  mutateWorkspaceTheme,
  mutateAboutBody,
} from "../src/lib/blueprint/mutate";

const OUT_BEFORE = "C:/Users/maxim/AppData/Local/Temp/c34-before.html";
const OUT_AFTER = "C:/Users/maxim/AppData/Local/Temp/c34-after.html";

function wrap(label: string, html: string, css: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${label}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" />
  <style>
${css}
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

// 1. BEFORE: workspace freshly created with HVAC blueprint, no edits.
const seeded = buildBlueprintForWorkspace("DFW Blueprint Test", "hvac");
const before = renderBlueprint(seeded);
writeFileSync(OUT_BEFORE, wrap("BEFORE — DFW Blueprint Test (template)", before.contentHtml, before.contentCss), "utf8");
console.log(`✓ BEFORE  ${before.contentHtml.length.toLocaleString()} bytes html → ${OUT_BEFORE}`);

// 2. AFTER: simulates an operator's Claude Code session running through
//    the customization loop end-to-end. Each step:
//      a. load blueprint (round-trip through persist)
//      b. mutate
//      c. render
//      d. (in production: save to landing_pages.blueprintJson)
let bp = seeded;

// Operator: "change my hero headline to Same-day HVAC repair in DFW"
bp = loadBlueprintOrFallback({ blueprintJson: bp }, "DFW Blueprint Test", "hvac");
bp = mutateHeroHeadline(bp, "Same-day HVAC repair in DFW");

// Operator: "and change the subhead too"
bp = loadBlueprintOrFallback({ blueprintJson: bp }, "DFW Blueprint Test", "hvac");
bp = mutateHeroSubhead(
  bp,
  "Family-owned, licensed in Texas, on time or it's free. Call any time — we answer the phone."
);

// Operator: "switch the primary button label to 'Get a same-day quote'"
bp = loadBlueprintOrFallback({ blueprintJson: bp }, "DFW Blueprint Test", "hvac");
bp = mutateHeroCtaPrimaryLabel(bp, "Get a same-day quote");

// Operator: "change my accent to a brighter cyan"  (update_theme path)
bp = loadBlueprintOrFallback({ blueprintJson: bp }, "DFW Blueprint Test", "hvac");
bp = mutateWorkspaceTheme(bp, { accent: "#0EA5E9" });

// Operator: "rename the first service card"  (update_landing_section path)
bp = loadBlueprintOrFallback({ blueprintJson: bp }, "DFW Blueprint Test", "hvac");
bp = mutateSectionField(bp, "services-grid", "items.0.title", "24/7 emergency AC repair");

// Operator: "fill in the about copy"  (clears [City] placeholder, restores section)
bp = loadBlueprintOrFallback({ blueprintJson: bp }, "DFW Blueprint Test", "hvac");
bp = mutateAboutBody(
  bp,
  "We're a family-owned HVAC company that's been serving Dallas-Fort Worth for over 20 years. We hire local techs, train them properly, and pay them well — which is why our team stays. When you call us, you get someone who's been doing this for years, not someone reading a script."
);

const after = renderBlueprint(bp);
writeFileSync(OUT_AFTER, wrap("AFTER — DFW Blueprint Test (6 customizations applied)", after.contentHtml, after.contentCss), "utf8");
console.log(`✓ AFTER   ${after.contentHtml.length.toLocaleString()} bytes html → ${OUT_AFTER}`);

// Quick sanity report — diff in HTML/CSS size + which polish markers
// remain. Both should still contain every C3.x marker.
const POLISH_MARKERS = [
  "sf-frame", "sf-navbar", "sf-hero__corner", "sf-hero__glow",
  "sf-btn__icon", "sf-faq__chevron", "sf-emergency", "Powered by",
  "Instrument+Serif", "--sf-bg-primary", "@keyframes sfPulse",
];
const beforeAll = before.contentHtml + before.contentCss;
const afterAll = after.contentHtml + after.contentCss;
const beforePolish = POLISH_MARKERS.filter((m) => beforeAll.includes(m));
const afterPolish = POLISH_MARKERS.filter((m) => afterAll.includes(m));
const lostMarkers = beforePolish.filter((m) => !afterPolish.includes(m));

console.log(`\n  before polish markers: ${beforePolish.length}/${POLISH_MARKERS.length}`);
console.log(`  after  polish markers: ${afterPolish.length}/${POLISH_MARKERS.length}`);
if (lostMarkers.length === 0) {
  console.log(`\n  ✓ no visual downgrade — all ${POLISH_MARKERS.length} polish markers preserved through customization loop`);
} else {
  console.log(`\n  ✗ regression: lost markers after customization: ${lostMarkers.join(", ")}`);
  process.exitCode = 1;
}
