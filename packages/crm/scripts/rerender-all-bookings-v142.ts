/**
 * v1.4.2 hotfix backfill — re-render every workspace's booking template
 * HTML so the standard name + email fields (just prepended to
 * landing_pages.blueprint_json by backfill-booking-form-fields.mjs)
 * actually show up in the rendered <form>.
 *
 * Why: backfill-booking-form-fields.mjs updated the blueprint_json
 * (the source of truth) but the bookings.content_html column is a
 * cached projection that the public /book page serves directly. Until
 * we re-render, the public page still shows the old form without
 * name/email — even though the blueprint is correct.
 *
 * This is a one-shot for the v1.4.0/v1.4.1 → v1.4.2 transition. Any
 * future operator-driven change (persist_block, update_landing_section,
 * Stripe webhook → reRenderAllSurfacesForOrg) will re-render naturally.
 *
 * Usage (from packages/crm):
 *   pnpm tsx scripts/rerender-all-bookings-v142.ts
 *   pnpm tsx scripts/rerender-all-bookings-v142.ts --dry-run
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, landingPages } from "@/db/schema";
import { renderCalcomMonthV1 } from "@/lib/blueprint/renderers/calcom-month-v1";
import { loadBlueprintOrFallback } from "@/lib/blueprint/persist";

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  const templateRows = await db
    .select({
      id: bookings.id,
      orgId: bookings.orgId,
      title: bookings.title,
    })
    .from(bookings)
    .where(eq(bookings.status, "template"));

  console.log(
    `Scanning ${templateRows.length} booking template rows ${isDryRun ? "(dry-run)" : ""}...`,
  );

  let touched = 0;
  let skipped = 0;
  for (const row of templateRows) {
    try {
      const [landing] = await db
        .select({
          blueprintJson: landingPages.blueprintJson,
          title: landingPages.title,
          settings: landingPages.settings,
        })
        .from(landingPages)
        .where(
          and(
            eq(landingPages.orgId, row.orgId),
            eq(landingPages.slug, "home"),
          ),
        )
        .limit(1);

      if (!landing?.blueprintJson) {
        console.log(`  - org ${row.orgId} — no landing blueprint, skipping`);
        skipped += 1;
        continue;
      }

      const settings = (landing.settings ?? {}) as Record<string, unknown>;
      const industry =
        typeof settings.industry === "string"
          ? (settings.industry as string)
          : null;
      const bp = loadBlueprintOrFallback(
        { blueprintJson: landing.blueprintJson },
        landing.title ?? row.title,
        industry,
      );

      const { html, css } = renderCalcomMonthV1(bp);

      if (isDryRun) {
        console.log(
          `  ✓ org ${row.orgId} — would re-render (html ${html.length} bytes)`,
        );
      } else {
        await db
          .update(bookings)
          .set({
            contentHtml: html,
            contentCss: css,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, row.id));
        console.log(`  ✓ org ${row.orgId} — re-rendered`);
      }
      touched += 1;
    } catch (err) {
      console.warn(
        `  ✗ org ${row.orgId} — failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(
    `\nDone. Touched ${touched}/${templateRows.length} rows (${skipped} skipped).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
