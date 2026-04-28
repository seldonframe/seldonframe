/**
 * Preview script — renders a blueprint to a self-contained HTML file
 * for visual QA. Used during Phase 3 C3 review before the branch
 * merges (production doesn't have the renderer yet, so create_workspace
 * against prod won't show the new output).
 *
 * Usage (from packages/crm):
 *   pnpm tsx scripts/preview-blueprint.mts hvac "DFW Blueprint Test" /tmp/preview.html
 *
 * Args:
 *   industry       — pickTemplate() key (e.g. "hvac", "general")
 *   workspaceName  — replaces the workspace.name slot in the blueprint
 *   outFile        — absolute path for the generated HTML
 */
import { writeFileSync } from "node:fs";
import { renderGeneralServiceV1 } from "../src/lib/blueprint/renderers/general-service-v1";
import { pickTemplate } from "../src/lib/blueprint/templates";

const [, , industry = "general", workspaceName = "Preview Workspace", outFile = "/tmp/preview.html"] =
  process.argv;

const blueprint = pickTemplate(industry);
blueprint.workspace.name = workspaceName;

const { html, css } = renderGeneralServiceV1(blueprint);

const fullPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${workspaceName} — preview</title>
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
console.log(`✓ Rendered ${industry} blueprint with name="${workspaceName}"`);
console.log(`  Wrote ${fullPage.length.toLocaleString()} bytes to ${outFile}`);
console.log(`  Open in any browser to preview.`);
