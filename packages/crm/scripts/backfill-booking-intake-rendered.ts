/**
 * Wiring-task backfill — populate `bookings.content_html/css` and
 * `intake_forms.content_html/css` for rows that predate the wiring.
 *
 * Why: post-wiring, every workspace seeds its booking + intake templates
 * with pre-rendered HTML/CSS so the public /book and /forms routes can
 * serve the C4 + C5 blueprint output directly. Existing rows from
 * before this ships have NULL content columns and the route handlers
 * fall back to the legacy React components — visually inconsistent with
 * the C3.x landing.
 *
 * This script walks rows where contentHtml IS NULL, derives a Blueprint
 * from `landing_pages.blueprint_json` for the same org (the canonical
 * source of truth post-C3.3), runs the appropriate renderer, and
 * persists. Idempotent — re-runs are safe because we only touch
 * NULL rows.
 *
 * Falls back to `pickTemplate(industry)` for orgs whose landing_pages
 * row also predates C3.3 (no blueprint_json yet) — that's the same
 * fallback path loadBlueprintOrFallback uses.
 *
 * Usage (from packages/crm):
 *   pnpm tsx scripts/backfill-booking-intake-rendered.ts
 *   pnpm tsx scripts/backfill-booking-intake-rendered.ts --dry-run
 */
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { bookings, intakeForms, landingPages } from "@/db/schema";
import { renderCalcomMonthV1 } from "@/lib/blueprint/renderers/calcom-month-v1";
import { renderFormbricksStackV1 } from "@/lib/blueprint/renderers/formbricks-stack-v1";
import { loadBlueprintOrFallback } from "@/lib/blueprint/persist";

const isDryRun = process.argv.includes("--dry-run");

async function loadBlueprintForOrg(orgId: string, fallbackName: string) {
  // Most orgs created post-C3.3 have a landing row with blueprint_json
  // populated. The few that predate it fall through to
  // loadBlueprintOrFallback's pickTemplate path.
  const [landing] = await db
    .select({
      blueprintJson: landingPages.blueprintJson,
      title: landingPages.title,
      settings: landingPages.settings,
    })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, orgId), eq(landingPages.slug, "home")))
    .limit(1);

  const settings = (landing?.settings ?? {}) as Record<string, unknown>;
  const industry = typeof settings.industry === "string" ? (settings.industry as string) : null;
  const wsName = landing?.title ?? fallbackName;

  return loadBlueprintOrFallback(
    { blueprintJson: landing?.blueprintJson ?? null },
    wsName,
    industry
  );
}

async function backfillBookings() {
  const candidates = await db
    .select({
      id: bookings.id,
      orgId: bookings.orgId,
      title: bookings.title,
    })
    .from(bookings)
    .where(and(eq(bookings.status, "template"), isNull(bookings.contentHtml)));

  if (candidates.length === 0) {
    console.log("✓ No booking rows need backfilling.");
    return 0;
  }
  console.log(`Found ${candidates.length} booking template${candidates.length === 1 ? "" : "s"} without content_html.`);

  let touched = 0;
  for (const row of candidates) {
    const bp = await loadBlueprintForOrg(row.orgId, row.title);
    const rendered = renderCalcomMonthV1(bp);
    console.log(`  ↪ booking ${row.id} (org=${row.orgId})${isDryRun ? " (dry)" : ""}`);
    if (!isDryRun) {
      await db
        .update(bookings)
        .set({
          contentHtml: rendered.html,
          contentCss: rendered.css,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, row.id));
      touched += 1;
    }
  }
  return touched;
}

async function backfillIntake() {
  const candidates = await db
    .select({
      id: intakeForms.id,
      orgId: intakeForms.orgId,
      name: intakeForms.name,
    })
    .from(intakeForms)
    .where(isNull(intakeForms.contentHtml));

  if (candidates.length === 0) {
    console.log("✓ No intake rows need backfilling.");
    return 0;
  }
  console.log(`Found ${candidates.length} intake form${candidates.length === 1 ? "" : "s"} without content_html.`);

  let touched = 0;
  for (const row of candidates) {
    const bp = await loadBlueprintForOrg(row.orgId, row.name);
    const rendered = renderFormbricksStackV1(bp);
    console.log(`  ↪ intake ${row.id} (org=${row.orgId})${isDryRun ? " (dry)" : ""}`);
    if (!isDryRun) {
      await db
        .update(intakeForms)
        .set({
          contentHtml: rendered.html,
          contentCss: rendered.css,
          updatedAt: new Date(),
        })
        .where(eq(intakeForms.id, row.id));
      touched += 1;
    }
  }
  return touched;
}

async function main() {
  const bookingsDone = await backfillBookings();
  const intakeDone = await backfillIntake();
  console.log(`\n${isDryRun ? "Dry-run summary" : "Done"}: ${bookingsDone} bookings + ${intakeDone} intake rows updated.`);
}

main().catch((error) => {
  console.error("backfill-booking-intake-rendered failed:", error);
  process.exit(1);
});
