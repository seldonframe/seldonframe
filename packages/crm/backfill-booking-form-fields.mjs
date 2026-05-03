// One-shot backfill: prepend standard name + email fields to every
// booking template that v1.4.0 / v1.4.1 created without them. Safe to
// re-run (deduplicates on field id).
//
// v1.4.2 — fixes the bug where v2 persist_block(booking) wiped out the
// standard fields v1's bootstrap had set, producing booking forms with
// no name/email inputs. New v2 workspaces created after the v1.4.2
// deploy don't need this; this catches the workspaces created in the
// gap.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").replace(/\r/g, "").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

const ENV_PATH = "C:/Users/maxim/AppData/Local/Temp/prod-env-fresh";
const env = parseEnv(ENV_PATH);
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL not in env file");
  process.exit(2);
}

const sql = neon(env.DATABASE_URL);

const STANDARD_FIELDS = [
  { id: "fullName", label: "Your name", type: "text", required: true },
  { id: "email", label: "Email", type: "email", required: true },
];

// Fix landing_pages.blueprint_json.booking.formFields for any workspace
// where the form is missing fullName or email.
const rows = await sql`
  SELECT id, org_id, blueprint_json
  FROM landing_pages
  WHERE blueprint_json IS NOT NULL
    AND blueprint_json->'booking'->'formFields' IS NOT NULL
`;

console.log(`Scanning ${rows.length} landing_pages rows with a booking blueprint...`);

let touched = 0;
for (const row of rows) {
  const bp = row.blueprint_json;
  const existing = bp?.booking?.formFields ?? [];
  const ids = new Set(existing.map((f) => f.id));
  const missing = STANDARD_FIELDS.filter((s) => !ids.has(s.id));
  if (missing.length === 0) continue;

  const merged = [...STANDARD_FIELDS, ...existing.filter((f) => !STANDARD_FIELDS.some((s) => s.id === f.id))];
  const nextBp = {
    ...bp,
    booking: { ...bp.booking, formFields: merged },
  };

  await sql`
    UPDATE landing_pages
    SET blueprint_json = ${nextBp}::jsonb,
        updated_at = NOW()
    WHERE id = ${row.id}
  `;
  console.log(`  ✓ org ${row.org_id} — added ${missing.map((m) => m.id).join(", ")}`);
  touched += 1;
}

console.log(`\nBackfilled ${touched}/${rows.length} workspaces.`);
console.log("Note: bookings.content_html is now stale for the touched workspaces.");
console.log("They will re-render on the next persist_block call OR on next reRenderAllSurfacesForOrg.");
