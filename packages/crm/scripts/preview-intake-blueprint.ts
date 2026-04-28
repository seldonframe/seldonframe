/**
 * Preview script for the C5 intake renderer (formbricks-stack-v1).
 * Renders the intake section of any blueprint to a self-contained HTML
 * file for visual QA, alongside the landing + booking previews.
 *
 * Usage (from packages/crm):
 *   pnpm tsx scripts/preview-intake-blueprint.ts hvac "DFW Blueprint Test" /tmp/intake.html
 */
import { writeFileSync } from "node:fs";
import { renderFormbricksStackV1 } from "../src/lib/blueprint/renderers/formbricks-stack-v1";
import { pickTemplate } from "../src/lib/blueprint/templates";

const [, , industry = "hvac", workspaceName = "Preview Workspace", outFile = "/tmp/intake.html"] =
  process.argv;

const blueprint = pickTemplate(industry);
blueprint.workspace.name = workspaceName;

const { html, css } = renderFormbricksStackV1(blueprint);

const fullPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${workspaceName} — Tell us about the job</title>
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
console.log(`✓ Rendered ${industry} intake blueprint with name="${workspaceName}"`);
console.log(`  Wrote ${fullPage.length.toLocaleString()} bytes to ${outFile}`);
console.log(`  Open in any browser to preview (full multi-step flow + completion).`);
