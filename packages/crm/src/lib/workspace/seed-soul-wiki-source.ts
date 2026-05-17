// 2026-05-17 — Seed the soul_sources row for a freshly-created
// workspace's source URL (the URL the operator pasted into
// /clients/new). The /settings/soul-wiki page then surfaces it as a
// pre-populated source the operator can iterate on (add YouTube,
// testimonials, paste text, etc.) without re-entering the website.
//
// Same shape as the existing seedSoulWikiFromOnboardingWebsite helper
// in lib/soul/install.ts — just exposed at a clean callsite so the
// web-onboarding pipeline (run-create-from-url) can call it directly
// without going through the soul-install path.
//
// Idempotent: skips if a (orgId, type='url', sourceUrl) row already
// exists. Non-fatal: the HTTP fetch + ingest can fail (DNS, 4xx, etc.)
// and we just log + continue. The workspace is fully usable without
// the seeded source — operators can add it manually later.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { soulSources } from "@/db/schema";
import { ingestSource } from "@/lib/soul-wiki/ingest";
import { incrementalCompile } from "@/lib/soul-wiki/compile";

export type SeedSoulWikiSourceResult =
  | { ok: true; created: true; sourceId: string }
  | { ok: true; created: false; reason: "already_seeded" }
  | { ok: false; reason: string };

export async function seedSoulWikiSourceUrl(
  orgId: string,
  sourceUrl: string,
): Promise<SeedSoulWikiSourceResult> {
  if (!orgId) return { ok: false, reason: "missing_org_id" };
  const url = String(sourceUrl ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, reason: "invalid_source_url" };
  }

  // Skip if we've already seeded this exact URL for this workspace.
  // Avoids surfacing the same source twice when the operator runs
  // create_workspace twice with the same URL.
  const [existing] = await db
    .select({ id: soulSources.id })
    .from(soulSources)
    .where(
      and(
        eq(soulSources.orgId, orgId),
        eq(soulSources.type, "url"),
        eq(soulSources.sourceUrl, url),
      ),
    )
    .limit(1);
  if (existing?.id) {
    return { ok: true, created: false, reason: "already_seeded" };
  }

  try {
    const { rawContent, title, metadata } = await ingestSource(orgId, {
      type: "url",
      url,
      title: `Website: ${url}`,
    });

    const [inserted] = await db
      .insert(soulSources)
      .values({
        orgId,
        type: "url",
        title,
        sourceUrl: url,
        rawContent,
        metadata,
        status: "pending",
      })
      .returning({ id: soulSources.id });

    if (!inserted?.id) {
      return { ok: false, reason: "insert_returned_no_row" };
    }

    // Kick off compilation in the background — best-effort, the
    // /settings/soul-wiki page also re-triggers compile when the
    // operator hits Save.
    void incrementalCompile(orgId, inserted.id).catch(() => {
      return;
    });

    return { ok: true, created: true, sourceId: inserted.id };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "ingest_failed",
    };
  }
}
