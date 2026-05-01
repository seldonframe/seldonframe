import Link from "next/link";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getBrandingSettings } from "@/lib/branding/actions";
import { checkPortalPlanGate } from "@/lib/portal/plan-gate";
import { ClientPortalSettings } from "@/components/settings/client-portal-settings";

/**
 * May 1, 2026 — Client Portal V1: workspace-level settings page.
 *
 * Shows:
 *   - Plan-gate banner (active green check on Growth/Scale, amber
 *     upgrade nudge on Free)
 *   - Workspace toggle (read-only, derived from plan)
 *   - Public portal URL with one-click copy
 *   - Branding preview using the workspace's primary color
 *   - Workspace-level metrics (portal-enabled count, active count)
 *
 * The actual writable surface for granting portal access is on the
 * per-contact record's Portal Access card. This page is the
 * workspace-level overview + entry point.
 */

function getAppOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    null
  );
}

export default async function ClientPortalSettingsPage() {
  const orgId = await getOrgId();

  if (!orgId) {
    return (
      <section className="animate-page-enter space-y-3 p-4 sm:p-6">
        <h1 className="text-lg font-semibold">Client Portal</h1>
        <p className="text-sm text-muted-foreground">No active workspace.</p>
      </section>
    );
  }

  // Server component — `new Date()` here is safe; the eslint
  // react-hooks/purity rule trips on `Date.now()` even on the server.
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [orgRow, branding, planGate, enabledCountRow, activeCountRow, totalCountRow] =
    await Promise.all([
      db
        .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)
        .then((r) => r[0] ?? null),
      getBrandingSettings().catch(() => null),
      checkPortalPlanGate(orgId).catch(() => ({
        allowed: false,
        tier: "free",
        reason: "plan_check_failed" as string | undefined,
      })),
      db
        .select({ c: count() })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), eq(contacts.portalAccessEnabled, true)))
        .then((r) => r[0] ?? { c: 0 }),
      db
        .select({ c: count() })
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, orgId),
            eq(contacts.portalAccessEnabled, true),
            gt(contacts.portalLastLoginAt, thirtyDaysAgo)
          )
        )
        .then((r) => r[0] ?? { c: 0 }),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(contacts)
        .where(eq(contacts.orgId, orgId))
        .then((r) => r[0] ?? { c: 0 }),
    ]);

  const orgSlug = orgRow?.slug ?? null;
  const workspaceName = orgRow?.name ?? branding?.orgName ?? "Your workspace";
  const brandPrimaryColor = branding?.primaryColor || null;

  const appOrigin = getAppOrigin();
  const portalUrl =
    orgSlug && appOrigin ? `${appOrigin}/portal/${orgSlug}/login` : null;

  return (
    <section className="animate-page-enter space-y-6 sm:space-y-8">
      <div className="space-y-2">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3" />
          Back to Settings
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
          Client Portal
        </h1>
        <p className="text-sm text-muted-foreground">
          Give your clients a private dashboard to view their pipeline,
          bookings, documents, and messages.
        </p>
      </div>

      <ClientPortalSettings
        tier={planGate.tier}
        planAllowed={planGate.allowed}
        planReason={planGate.reason ?? null}
        orgSlug={orgSlug}
        workspaceName={workspaceName}
        brandPrimaryColor={brandPrimaryColor}
        enabledContactsCount={Number(enabledCountRow.c ?? 0)}
        activeContactsCount={Number(activeCountRow.c ?? 0)}
        totalContactsCount={Number(totalCountRow.c ?? 0)}
        portalUrl={portalUrl}
      />
    </section>
  );
}
