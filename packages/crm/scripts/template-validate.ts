/**
 * Template validator — Phase 3 C1.
 *
 * Walks `skills/templates/*.json` (excluding schema.json + README.md) and
 * validates each against the JSON Schema at `skills/templates/schema.json`.
 *
 * Usage (from repo root or packages/crm):
 *   pnpm template:validate
 *
 * Exit codes:
 *   0 — every template passes
 *   1 — at least one template fails OR the schema itself is invalid
 *   2 — argument / I/O error before validation began
 *
 * This is the CI gate that prevents shipping a vertical content pack
 * (e.g. dental.json, salon.json) with a typo, missing required field, or
 * an admin-field id that doesn't match the snake_case pattern.
 *
 * Implementation note: Ajv2020 is the right entry point for Draft 2020-12
 * schemas — `Ajv` (the default) defaults to Draft-07. ajv-formats adds the
 * `email`, `uri`, `date`, etc. format validators referenced in the schema.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
// scripts/template-validate.ts → packages/crm/scripts → packages/crm → packages → repo root
const repoRoot = resolve(here, "..", "..", "..");
const templatesDir = join(repoRoot, "skills", "templates");
const schemaPath = join(templatesDir, "schema.json");

function loadJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✗ Failed to read/parse ${path}: ${msg}`);
    process.exit(2);
  }
}

function listTemplateFiles(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(templatesDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✗ Failed to read templates dir ${templatesDir}: ${msg}`);
    process.exit(2);
  }

  return entries
    .filter((name) => name.endsWith(".json"))
    .filter((name) => name !== "schema.json")
    .sort();
}

const schema = loadJson(schemaPath);
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

let validate;
try {
  validate = ajv.compile(schema as object);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`✗ schema.json failed to compile: ${msg}`);
  process.exit(1);
}

const files = listTemplateFiles();
if (files.length === 0) {
  console.error("✗ No template files found in skills/templates/ (other than schema.json).");
  process.exit(2);
}

console.log(`Validating ${files.length} template(s) against schema.json…\n`);

let allOk = true;
for (const filename of files) {
  const data = loadJson(join(templatesDir, filename));
  const valid = validate(data);
  if (valid) {
    console.log(`  ✓ ${filename}`);
  } else {
    allOk = false;
    console.log(`  ✗ ${filename}`);
    for (const err of validate.errors ?? []) {
      const path = err.instancePath || "<root>";
      const params = JSON.stringify(err.params);
      console.log(`      ${path}: ${err.message}  ${params}`);
    }
  }
}

if (allOk) {
  console.log(`\n✓ All ${files.length} template(s) valid.`);
  process.exit(0);
} else {
  console.log("\n✗ Validation failed. See errors above.");
  process.exit(1);
}
