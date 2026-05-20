// packages/crm/src/lib/workspaces/summarize.ts
//
// Pure shape function for the WorkspaceSummary returned by the
// /api/v1/web/workspaces/mine endpoint. No DB access — the route
// assembles raw rows and passes them in. Keeps the route handler thin
// and lets us test the status/url derivation in isolation.
//
// Status derivation rules:
//   - "setup":  soulCompletedAt is null (workspace never finished onboarding)
//   - "paused": soul completed but the most recent activity (or the soul
//               completion itself, if there's never been activity) is more
//               than 30 days ago — i.e. the workspace went cold.
//   - "active": otherwise.

export type WorkspaceStatus = "active" | "setup" | "paused";

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  publicUrl: string;
  /**
   * 2026-05-19 — Original brand URL (the URL the operator pasted into
   * /clients/new). Null when the workspace was created without a URL
   * (e.g. via createWorkspaceFromGooglePaste or a manual setup flow).
   * Shown as the primary brand reference on the /clients card; falls
   * back to the SeldonFrame subdomain (publicUrl) when null.
   */
  originalSiteUrl: string | null;
  dashboardUrl: string;
  status: WorkspaceStatus;
  contactCount: number;
  lastActivityAt: string | null;
  newLeadsThisWeek: number;
  /** 2026-05-19 — upcoming bookings count for the next 7 days. */
  bookingsThisWeek: number;
};

export type SummarizeInput = {
  id: string;
  slug: string;
  name: string;
  soulCompletedAt: Date | null;
  contactCount: number;
  lastActivityAt: Date | null;
  newLeadsThisWeek: number;
  bookingsThisWeek: number;
  originalSiteUrl: string | null;
  workspaceBaseDomain: string;
  now: Date;
};

const PAUSED_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

function deriveStatus(
  soulCompletedAt: Date | null,
  lastActivityAt: Date | null,
  now: Date,
): WorkspaceStatus {
  if (!soulCompletedAt) {
    return "setup";
  }

  if (!lastActivityAt) {
    // Soul completed but no activity ever — fall back to comparing
    // against soul completion itself so a freshly-built workspace
    // doesn't immediately render as "paused".
    return now.getTime() - soulCompletedAt.getTime() > PAUSED_THRESHOLD_MS
      ? "paused"
      : "active";
  }

  return now.getTime() - lastActivityAt.getTime() > PAUSED_THRESHOLD_MS
    ? "paused"
    : "active";
}

export function summarizeWorkspace(input: SummarizeInput): WorkspaceSummary {
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    publicUrl: `https://${input.slug}.${input.workspaceBaseDomain}`,
    originalSiteUrl: input.originalSiteUrl,
    dashboardUrl: `/dashboard?workspace=${input.id}`,
    status: deriveStatus(input.soulCompletedAt, input.lastActivityAt, input.now),
    contactCount: input.contactCount,
    lastActivityAt: input.lastActivityAt
      ? input.lastActivityAt.toISOString()
      : null,
    newLeadsThisWeek: input.newLeadsThisWeek,
    bookingsThisWeek: input.bookingsThisWeek,
  };
}
