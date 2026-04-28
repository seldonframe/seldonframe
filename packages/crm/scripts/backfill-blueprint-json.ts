/**
 * C3.3 backfill — populate `landing_pages.blueprint_json` for rows that
 * predate the column.
 *
 * Why: post-C3.3, every blueprint-rendered landing page persists its
 * source Blueprint JSON alongside the rendered HTML/CSS so the
 * customization loop (load → mutate → render → save) can round-trip.
 * Existing rows from before C3.3 have NULL blueprint_json — they still
 * render fine because contentHtml/contentCss were saved at create time,
 * but the *first* customization edit would hit the lazy fallback in
 * loadBlueprintOrFallback and re-derive a starter blueprint that may
 * not exactly match the original render (in particular, fields like
 * workspace.name are best-effort restored from `landing_pages.title`).
 *
 * This script gives those rows a clean blueprint_json so subsequent
 * edits are guaranteed-fresh. It's idempotent — only walks rows where
 * source='template' AND blueprint_json IS NULL — so re-runs are safe.
 *
 * Usage (from packages/crm):
 *   pnpm tsx scripts/backfill-blueprint-json.ts
 *   pnpm tsx scripts/backfill-blueprint-json.ts --dry-run
 *
 * Logs each row it touches. No output = nothing to backfill.
 */
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { landingPages } from "@/db/schema";
import {
  buildBlueprintForWorkspace,
  renderBlueprint,
} from "@/lib/blueprint/persist";

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  const candidates = await db
    .select({
      id: landingPages.id,
      orgId: landingPages.orgId,
      title: landingPages.title,
      settings: landingPages.settings,
      contentHtml: landingPages.contentHtml,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.source, "template"),
        isNull(landingPages.blueprintJson)
      )
    );

  if (candidates.length === 0) {
    console.log("✓ No rows need backfilling.");
    return;
  }

  console.log(
    `Found ${candidates.length} template-source landing page${candidates.length === 1 ? "" : "s"} without blueprint_json.${isDryRun ? " (dry run)" : ""}`
  );

  let touched = 0;
  let skipped = 0;
  for (const row of candidates) {
    const settings = (row.settings ?? {}) as Record<string, unknown>;
    const industry =
      typeof settings.industry === "string" ? (settings.industry as string) : null;

    // Re-derive the blueprint from template + workspace name. Slot
    // resolution will hide unfilled placeholders the same way the live
    // render does, so the re-rendered HTML stays equivalent.
    const blueprint = buildBlueprintForWorkspace(row.title, industry);
    const rendered = renderBlueprint(blueprint);

    console.log(
      `  ↪ ${row.id} (org=${row.orgId}, industry=${industry ?? "general"})${
        rendered.contentHtml.length === (row.contentHtml?.length ?? 0)
          ? " — html length unchanged"
          : ""
      }`
    );

    if (!isDryRun) {
      await db
        .update(landingPages)
        .set({
          blueprintJson: blueprint as unknown as Record<string, unknown>,
          contentHtml: rendered.contentHtml,
          contentCss: rendered.contentCss,
          settings: { ...settings, industry, blueprintRenderer: "general-service-v1" },
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, row.id));
      touched += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(
    `\n${isDryRun ? "Dry-run summary" : "Done"}: ${touched} updated, ${skipped} skipped (dry-run).`
  );
}

main().catch((error) => {
  console.error("backfill-blueprint-json failed:", error);
  process.exit(1);
});
