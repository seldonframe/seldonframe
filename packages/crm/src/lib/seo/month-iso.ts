// "Month YYYY" -> ISO date ("2026-07-01") for Article JSON-LD
// dateModified/datePublished across the SEO templates (best, seldonframe-vs,
// alternative, vs, pricing). Single source of truth — best-page.tsx re-exports
// from here.
//
// Always the 1st of the month: these are coarse registry-refresh dates, not
// day-level facts, so never-lies means we don't invent a day. THROWS on
// anything unrecognized rather than emitting a guessed/garbage date into
// schema.org markup — registry date strings are controlled data, so a bad one
// should fail the static build loudly, not ship silently-invalid schema.

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function monthYearToIso(monthYear: string): string {
  const m = monthYear.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) throw new Error(`monthYearToIso: unrecognized "Month YYYY" string: "${monthYear}"`);
  const monthIndex = MONTHS.indexOf(m[1].toLowerCase());
  if (monthIndex === -1) throw new Error(`monthYearToIso: unrecognized month name: "${m[1]}"`);
  return `${m[2]}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}
