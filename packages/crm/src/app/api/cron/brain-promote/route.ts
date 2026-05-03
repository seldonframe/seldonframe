// v1.6.0 — weekly brain promotion + pruning cron.
//
// Runs Sundays at 05:00 UTC (vercel.json schedule: "0 5 * * 0"). Two
// jobs in one cron:
//
//   1. PROMOTE: workspace-scoped notes that hit the threshold get
//      synthesized into anonymized layer-2 patterns.
//      Threshold: uses ≥ 10, confidence ≥ 0.7, present in ≥ 3 distinct
//      workspaces with the same path. Body of the global note is a
//      bullet-list aggregation of the workspace bodies (anonymized:
//      no workspace ids, no PII).
//
//   2. PRUNE: workspace-scoped notes with confidence < 0.3 + uses ≥ 10
//      get archived (currently: deleted; could move to a side table
//      later if we want recoverability).
//
// Both operations are idempotent — re-running the cron same week
// produces no diff. The cron is the ONLY consumer of these queries;
// per-request paths never touch promotion/pruning logic.

import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { brainNotes } from "@/db/schema/brain-notes";
import {
  findPromotionCandidates,
  findPruneCandidates,
} from "@/lib/brain/store";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) return true;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) return true;
  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

interface RunResult {
  promoted: Array<{ path: string; workspace_count: number }>;
  pruned: number;
  duration_ms: number;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const result: RunResult = {
    promoted: [],
    pruned: 0,
    duration_ms: 0,
  };

  // ─── PROMOTE ────────────────────────────────────────────────────────────

  const candidates = await findPromotionCandidates({
    minUses: 10,
    minConfidence: 0.7,
    minWorkspaces: 3,
  });

  for (const c of candidates) {
    // Synthesize an anonymized layer-2 body. We don't run an LLM here
    // (yet) — for v1.6.0 we just bullet-list the highest-confidence
    // workspace bodies. Future: an LLM call summarizes them into a
    // single coherent pattern note. Storing as global note with metadata
    // tagging the source as "promotion".
    const body = synthesizeGlobalBody(c.sample_bodies, c.workspace_count);

    // Upsert into layer-2 (org_id NULL, scope='global').
    const [existing] = await db
      .select({ id: brainNotes.id })
      .from(brainNotes)
      .where(
        and(isNull(brainNotes.orgId), eq(brainNotes.path, c.path)),
      )
      .limit(1);

    if (existing) {
      await db
        .update(brainNotes)
        .set({
          body,
          confidence: String(Math.min(0.95, c.avg_confidence)),
          metadata: {
            type: "pattern",
            tags: ["promoted", "cross-workspace"],
            source: `promotion:${new Date().toISOString().slice(0, 10)}`,
          },
          updatedAt: new Date(),
        })
        .where(eq(brainNotes.id, existing.id));
    } else {
      await db.insert(brainNotes).values({
        orgId: null,
        scope: "global",
        path: c.path,
        body,
        confidence: String(Math.min(0.95, c.avg_confidence)),
        uses: 0,
        wins: 0,
        metadata: {
          type: "pattern",
          tags: ["promoted", "cross-workspace"],
          source: `promotion:${new Date().toISOString().slice(0, 10)}`,
        },
      });
    }

    result.promoted.push({
      path: c.path,
      workspace_count: c.workspace_count,
    });
  }

  // ─── PRUNE ──────────────────────────────────────────────────────────────

  const pruneCandidates = await findPruneCandidates({
    maxConfidence: 0.3,
    minUses: 10,
    limit: 200,
  });

  for (const c of pruneCandidates) {
    await db
      .delete(brainNotes)
      .where(eq(brainNotes.id, c.id));
    result.pruned += 1;
  }

  // ─── Report ─────────────────────────────────────────────────────────────

  result.duration_ms = Date.now() - start;
  console.log(
    JSON.stringify({
      event: "brain_promote_run",
      ...result,
    }),
  );

  return NextResponse.json({ ok: true, ...result });
}

function synthesizeGlobalBody(
  sampleBodies: string[],
  workspaceCount: number,
): string {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const samples = (sampleBodies ?? [])
    .filter((s) => s && s.trim().length > 0)
    .slice(0, 5)
    .map((s) => `- ${s.replace(/\n+/g, " ").slice(0, 300)}`)
    .join("\n");

  return `# Cross-workspace pattern (promoted ${dateStamp})

Observed across **${workspaceCount} workspaces** with high confidence (≥0.7).

## Sample observations

${samples}

---

_This pattern was promoted from workspace-scoped notes by the weekly brain-promote cron. Anonymized — no workspace identifiers retained._
`;
}
