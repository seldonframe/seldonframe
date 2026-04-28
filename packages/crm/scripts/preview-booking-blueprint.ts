/**
 * Preview script for the C4 booking renderer (calcom-month-v1).
 * Renders the booking section of any blueprint to a self-contained HTML
 * file for visual QA, alongside the landing-page preview.
 *
 * Usage (from packages/crm):
 *   pnpm tsx scripts/preview-booking-blueprint.ts hvac "DFW Blueprint Test" /tmp/booking.html
 */
import { writeFileSync } from "node:fs";
import { renderCalcomMonthV1 } from "../src/lib/blueprint/renderers/calcom-month-v1";
import { pickTemplate } from "../src/lib/blueprint/templates";

const [, , industry = "hvac", workspaceName = "Preview Workspace", outFile = "/tmp/booking.html"] =
  process.argv;

const blueprint = pickTemplate(industry);
blueprint.workspace.name = workspaceName;

const { html, css } = renderCalcomMonthV1(blueprint);

const fullPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${workspaceName} — Book a meeting</title>
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

writeFileSync(outFile, fullPage, "utf8");
console.log(`✓ Rendered ${industry} booking blueprint with name="${workspaceName}"`);
console.log(`  Wrote ${fullPage.length.toLocaleString()} bytes to ${outFile}`);
console.log(`  Open in any browser to preview (calendar/slot/form/confirm flow works locally).`);
