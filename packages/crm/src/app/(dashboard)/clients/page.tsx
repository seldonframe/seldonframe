// packages/crm/src/app/(dashboard)/clients/page.tsx
//
// Cut B Phase 3 — agency's daily landing surface. Lists every client
// workspace the user owns/manages, with status, contact count, last
// activity, and weekly leads at a glance. At-limit click opens the
// shared <UpgradeModal>. Operator sessions (`__sf_operator_portal__:`)
// don't reach this page in the routing tree — the dashboard layout
// gates them; this server component assumes a real user session.
//
/*
 * Design-system audit (design:design-system, 2026-05-16, Cut B Phase 3):
 *   Header heading + subheading  → native <h1>+<p> w/ dashboard welcome tokens
 *   Usage badge                  → <Badge variant=secondary|destructive> + <Tooltip>
 *   Primary CTA                  → <Button variant=default> via render={<Link/>}
 *   Empty state                  → <Card> wrapping illustration + <h2> + <Button> CTA
 *   Card grid                    → native grid, grid-cols-1 md:grid-cols-2 xl:grid-cols-3
 *   WorkspaceCard shell          → <Card> + hover:ring on top of built-in ring-1
 *   Card status badge            → <Badge variant=outline> w/ className override for
 *                                  active (positive) / setup (caution) tokens; paused
 *                                  uses variant=secondary directly
 *   Card stat tiles              → native <dl><dt><dd>; rounded-xl border bg-card/70
 *   Card "Open dashboard" CTA    → <Button variant=outline size=sm> via render={<Link/>}
 *   UpgradeModal (at-limit)      → Cut A primitive, do NOT redefine
 *
 * Flagged for future: add `positive` + `caution` Badge variants if status
 * badges spread to more surfaces. Skeleton primitive absent — fine for
 * server-rendered Phase 3 but worth adding before any optimistic UI.
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

  const workspaces: WorkspaceSummary[] = orgs.map((org) => {
    const rollup = rollupById.get(org.id);
    return summarizeWorkspace({
      id: org.id,
      slug: org.slug,
      name: org.name,
      soulCompletedAt: rollup?.soulCompletedAt ?? null,
      contactCount: org.contactCount,
      lastActivityAt: rollup?.lastActivityAt ?? null,
      newLeadsThisWeek: rollup?.newLeadsThisWeek ?? 0,
      workspaceBaseDomain,
      now,
    });
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
