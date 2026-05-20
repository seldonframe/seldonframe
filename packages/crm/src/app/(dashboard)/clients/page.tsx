// packages/crm/src/app/(dashboard)/clients/page.tsx
//
// Cut B Phase 3 — agency's daily landing surface. Lists every client
// workspace the user owns/manages, with status, contact count, last
// activity, and weekly leads at a glance. At-limit click opens the
// shared <UpgradeModal>. Operator sessions (`__sf_operator_portal__:`)
// don't reach this page in the routing tree — the dashboard layout
// gates them; this server component assumes a real user session.
//
// 2026-05-19 — redesign pass. The previous incarnation paired the
// generic Card primitive with a tight 2-stat grid; the redesigned
// version mirrors the visual language of /clients/[slug]/ready —
// hero header with active-count chip + primary CTA, richer 2x2
// stat tiles on each card, original brand URL surfaced under the
// workspace name, and a styled empty-state hero. Sort order
// flipped from createdAt-desc to lastActivityAt-desc so the
// workspaces an operator is touching TODAY surface first.
//
/*
 * Design-system audit (refreshed 2026-05-19):
 *   Hero header                  → native <h1>+<p> tracking-tight + emerald active chip
 *   Usage badge                  → <Badge variant=secondary|destructive> + <Tooltip>
 *   Primary CTA                  → <Button variant=default> with Plus icon
 *   Empty state                  → <section> rounded-2xl border-border/70 bg-card/40
 *                                  with Sparkles in primary/10 + crm-pressable Link CTA
 *   Card grid                    → native grid, grid-cols-1 md:grid-cols-2 xl:grid-cols-3
 *   WorkspaceCard shell          → <article> rounded-2xl border-border/80 bg-card/80
 *                                  p-5 + hover:shadow-(--shadow-card-hover)
 *   Card status pill             → <Badge variant=outline> w/ emerald/amber tokens —
 *                                  matches the ready page audience chips
 *   Card stat tiles              → native <dl><dt><dd> 2x2; rounded-xl border bg-card/70
 *   Card primary CTA             → bg-primary crm-pressable Link with ArrowRight
 *   UpgradeModal (at-limit)      → Cut A primitive, do NOT redefine
 */

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getWorkspaceLimitStatusForUser,
  listManagedOrganizationsForUser,
} from "@/lib/billing/orgs";
import { rollupWorkspace } from "@/lib/workspaces/rollup";
import {
  summarizeWorkspace,
  type WorkspaceSummary,
} from "@/lib/workspaces/summarize";
import { ClientsGrid } from "./clients-grid";

// Cut B note: `limitStatus.tier` is a free-form string from the DB
// (default "free"). Coerce defensively to the closed union the UI
// accepts. Unknown values fall back to "free" — safer than rendering
// "Unlimited" to a user who isn't actually unlimited.
function asAgencyTier(value: string | null | undefined): "free" | "growth" | "scale" {
  if (value === "growth" || value === "scale") return value;
  return "free";
}

export default async function ClientsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [orgs, limitStatus] = await Promise.all([
    listManagedOrganizationsForUser(userId),
    getWorkspaceLimitStatusForUser(userId),
  ]);

  const workspaceBaseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "seldonframe.app";
  const now = new Date();

  // Per-workspace rollup is small (3 light queries per org). Parallelize.
  const rollups = await Promise.all(
    orgs.map((org) => rollupWorkspace(org.id)),
  );
  const rollupById = new Map(rollups.map((r) => [r.orgId, r]));

  const workspaces: WorkspaceSummary[] = orgs
    .map((org) => {
      const rollup = rollupById.get(org.id);
      return summarizeWorkspace({
        id: org.id,
        slug: org.slug,
        name: org.name,
        soulCompletedAt: rollup?.soulCompletedAt ?? null,
        contactCount: org.contactCount,
        lastActivityAt: rollup?.lastActivityAt ?? null,
        newLeadsThisWeek: rollup?.newLeadsThisWeek ?? 0,
        bookingsThisWeek: rollup?.bookingsThisWeek ?? 0,
        originalSiteUrl: rollup?.originalSiteUrl ?? null,
        workspaceBaseDomain,
        now,
      });
    })
    // 2026-05-19 — sort by recent activity (most-active first) so an
    // agency with many clients sees the ones they're working on TODAY
    // at the top. Workspaces with no activity fall back to their slug
    // for a stable order at the bottom.
    .sort((a, b) => {
      const aTime = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bTime = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.slug.localeCompare(b.slug);
    });

  const tier = asAgencyTier(limitStatus.tier);
  // Scale tier renders maxOrgs as 999 (display sentinel from
  // loadWorkspaceTierStatus). Treat that as unlimited at the page
  // boundary so the badge says "Unlimited workspaces" rather than
  // "X / 999 workspaces".
  const limit =
    tier === "scale" || !Number.isFinite(limitStatus.maxOrgs)
      ? Number.POSITIVE_INFINITY
      : limitStatus.maxOrgs;

  return (
    <main className="animate-page-enter flex-1 overflow-auto w-full space-y-6 p-3 sm:p-4 md:p-6">
      <ClientsGrid
        workspaces={workspaces}
        tier={tier}
        used={limitStatus.currentOrgs}
        limit={limit}
      />
    </main>
  );
}
