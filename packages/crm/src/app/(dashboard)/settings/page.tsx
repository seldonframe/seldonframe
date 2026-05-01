import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/db";
import { contacts, orgMembers, organizations, soulSources, soulWiki, type OrganizationSubscription } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getOrgSubscription } from "@/lib/billing/subscription";
import { getStripeConnectionStatus } from "@/lib/payments/actions";
import { getLabels } from "@/lib/soul/labels";
import { getSoul } from "@/lib/soul/server";
import { getCustomDomainSettings } from "@/lib/domains/actions";
import { listSavedFrameworkLibrary } from "@/lib/frameworks/actions";
import { getBrandingSettings } from "@/lib/branding/actions";
import { getThemeSettings } from "@/lib/theme/actions";
import { checkPortalPlanGate } from "@/lib/portal/plan-gate";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper copy: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

export default async function SettingsPage() {
  const orgId = await getOrgId();
  const subscriptionPromise: Promise<OrganizationSubscription> = orgId
    ? getOrgSubscription(orgId).catch((): OrganizationSubscription => ({}))
    : Promise.resolve<OrganizationSubscription>({});
  const themeSettingsPromise = getThemeSettings().catch(() => null);

  const [labels, stripeStatus, domainSettings, savedFrameworks, brandingSettings, themeSettings, subscription, soul, portalGate] = await Promise.all([
    getLabels(),
    getStripeConnectionStatus(),
    getCustomDomainSettings(),
    listSavedFrameworkLibrary(),
    getBrandingSettings(),
    themeSettingsPromise,
    subscriptionPromise,
    getSoul(),
    orgId
      ? checkPortalPlanGate(orgId).catch(() => ({ allowed: false, tier: "free" as string, reason: undefined as string | undefined }))
      : Promise.resolve({ allowed: false, tier: "free" as string, reason: undefined as string | undefined }),
  ]);

  // May 1, 2026 — Client Portal V1: count portal-enabled contacts so
  // the /settings tile can show "3 enabled" at a glance, the same way
  // /settings/integrations shows "2 connected".
  const [portalEnabledRow] = orgId
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), eq(contacts.portalAccessEnabled, true)))
    : [{ count: 0 }];

  const [orgRow] = orgId
    ? await db
        .select({
          integrations: organizations.integrations,
          timezone: organizations.timezone,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)
        .catch(() => [null])
    : [null];

  const [teamCountRow] = orgId
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orgMembers)
        .where(eq(orgMembers.orgId, orgId))
    : [{ count: 0 }];

  const [sourceCountRow] = orgId
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(soulSources)
        .where(eq(soulSources.orgId, orgId))
    : [{ count: 0 }];

  const [articleCountRow] = orgId
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(soulWiki)
        .where(eq(soulWiki.orgId, orgId))
    : [{ count: 0 }];

  const integrations = (orgRow?.integrations ?? {}) as {
    twilio?: { connected?: boolean };
    resend?: { connected?: boolean };
    kit?: { connected?: boolean };
    google?: { connected?: boolean; calendarConnected?: boolean };
  };

  const integrationSignals = [
    Boolean(integrations.resend?.connected),
    Boolean(integrations.kit?.connected),
    Boolean(integrations.twilio?.connected),
    Boolean(integrations.google?.connected || integrations.google?.calendarConnected),
  ];
  const connectedIntegrations = integrationSignals.filter(Boolean).length;

  // April 30, 2026 — pricing migration. Display labels for the new
  // tiers + grandfather mappings for legacy subscription strings.
  const tierLabelMap: Record<string, string> = {
    free: "Free",
    growth: "Growth",
    scale: "Scale",
    // Legacy tier strings still in subscriptions for grandfathered
    // customers — surface them with the equivalent new tier label so
    // the UI doesn't show a confused mix of old + new names.
    starter: "Growth",
    cloud_starter: "Growth",
    cloud_pro: "Scale",
    pro_3: "Scale",
    pro_5: "Scale",
    pro_10: "Scale",
    pro_20: "Scale",
    self_service: "Scale",
  };

  const tier = String(subscription.tier ?? "free");
  const tierLabel = tierLabelMap[tier] ?? tierLabelMap.free;
  const periodLabel = String(subscription.stripePriceId ?? "").includes("year") ? "Yearly" : "Monthly";
  const trialEndLabel = subscription.trialEndsAt
    ? new Date(subscription.trialEndsAt).toLocaleDateString([], { month: "short", day: "numeric" })
    : null;
  // SeldonFrame doesn't advertise a free trial; the "trialing" Stripe
  // status only appears for legacy or admin-minted subscriptions.
  // Keep a neutral status badge if it does show up.
  const isTrial = subscription.status === "trialing" && Boolean(trialEndLabel);
  const billingStatus = isTrial ? `Trial · ends ${trialEndLabel}` : `${tierLabel} · ${periodLabel}`;

  const domainStatus = domainSettings?.customDomain || "Not configured";
  const pipelineStagesCount = soul?.pipeline?.stages?.length ?? 0;
  const teamCount = Math.max(1, teamCountRow?.count ?? 0);
  const soulSourceCount = Math.max(0, sourceCountRow?.count ?? 0);
  const soulArticleCount = Math.max(0, articleCountRow?.count ?? 0);

  const frameworksStatus = savedFrameworks.length > 0 ? `${savedFrameworks.length} saved` : "No saved frameworks";
  const brandingStatus = brandingSettings?.removePoweredBy ? "White-label enabled" : null;
  const portalEnabledCount = Math.max(0, portalEnabledRow?.count ?? 0);
  const portalStatus = portalGate.allowed
    ? portalEnabledCount > 0
      ? `${portalEnabledCount} client${portalEnabledCount === 1 ? "" : "s"} enabled`
      : "No clients enabled yet"
    : "Growth or Scale required";

  const primaryGroups = [
    {
      id: "business",
      title: "Your Business",
      items: [
        {
          href: "/settings/workspace",
          title: "Workspace",
          description: "Workspace name, timezone, public URLs, and admin token info",
          status: <span className="text-xs text-zinc-400">{orgRow?.timezone ?? "UTC"}</span>,
        },
        {
          href: "/settings/profile",
          title: "Business Profile",
          description: "Name, industry, description, and Seldon custom context",
          status: null,
        },
        {
          href: "/settings/theme",
          title: "Brand & Theme",
          description: "Colors, fonts, logo, and visual style for public pages",
          status: (
            <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
              <span className="h-2.5 w-2.5 rounded-full border border-zinc-600" style={{ backgroundColor: themeSettings?.theme.primaryColor || "#14b8a6" }} />
              {themeSettings?.theme.primaryColor || "Primary color"}
            </span>
          ),
        },
        {
          href: "/settings/soul-wiki",
          title: "Soul Knowledge",
          description: "Feed Seldon your website, videos, and testimonials",
          status: <span className="text-xs text-zinc-400">{soulSourceCount} sources · {soulArticleCount} articles compiled</span>,
        },
        {
          href: "/settings/pipeline",
          title: "Pipeline",
          description: `Deal stages and workflow for your ${labels.deal.plural.toLowerCase()}`,
          status: <span className="text-xs text-zinc-400">{pipelineStagesCount} stages</span>,
        },
        {
          href: "/settings/integrations",
          title: "Integrations",
          description: "Resend, Kit, Twilio, and Google Calendar connections",
          status: <span className="text-xs text-zinc-400">{connectedIntegrations} connected</span>,
        },
        {
          href: "/settings/client-portal",
          title: "Client Portal",
          description: "Give clients a private dashboard for pipeline, bookings, documents, and messages",
          status: <span className="text-xs text-zinc-400">{portalStatus}</span>,
        },
      ],
    },
    {
      id: "account",
      title: "Account & Billing",
      items: [
        {
          href: "/settings/billing",
          title: "Billing",
          description: "Plan, trial, and subscription portal",
          status: <span className="text-xs text-zinc-400">{billingStatus}</span>,
        },
        {
          href: "/settings/domain",
          title: "Domain",
          description: "Custom domain for forms, bookings, and landing pages",
          status: <span className="text-xs text-zinc-400">{domainStatus}</span>,
        },
        {
          href: "/settings/team",
          title: "Team",
          description: "Members and roles",
          status: <span className="text-xs text-zinc-400">{teamCount} member{teamCount === 1 ? "" : "s"}</span>,
        },
      ],
    },
  ] as const;

  const advancedItems = [
    { href: "/settings/fields", title: "Custom Fields", description: "Add fields specific to your business", status: null },
    { href: "/settings/webhooks", title: "Webhooks", description: "Connect external services and automations", status: null },
    { href: "/settings/api", title: "API Keys", description: "Generate keys for programmatic access", status: null },
    { href: "/settings/branding", title: "Branding", description: "White-label and public brand defaults", status: brandingStatus ? <span className="text-xs text-zinc-400">{brandingStatus}</span> : null },
    { href: "/settings/frameworks", title: "Saved Frameworks", description: "Manage reusable framework presets", status: <span className="text-xs text-zinc-400">{frameworksStatus}</span> },
    { href: "/settings/soul-transfer", title: "Soul Export / Import", description: "Download or upload your system configuration", status: null },
    { href: "/settings/payments", title: "Payments", description: "Connect Stripe to accept payments", status: stripeStatus ? <span className="text-xs text-zinc-400">Connected</span> : <span className="text-xs text-zinc-400">Not connected</span> },
  ] as const;

  return (
    <section className="animate-page-enter space-y-6 sm:space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your business setup, account settings, and billing.</p>
      </div>

      <div className="space-y-4">
        {primaryGroups.map((group) => (
          <article key={group.id} className="rounded-xl border bg-card p-5 space-y-4">
            <p className="font-medium text-muted-foreground">{group.title}</p>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((section) => (
                <Link key={section.href} href={section.href} className="rounded-lg border border-zinc-800 p-5 hover:border-zinc-700 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-zinc-100">{section.title}</h3>
                      <p className="text-sm text-zinc-500 mt-1">{section.description}</p>
                      {section.status ? <div className="mt-2">{section.status}</div> : null}
                    </div>
                    <ChevronRight className="h-4 w-4 text-zinc-600 mt-1 shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </article>
        ))}

        <details className="rounded-xl border bg-card p-5" open={false}>
          <summary className="cursor-pointer list-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-muted-foreground">Advanced Settings</p>
                <p className="text-sm text-zinc-500 mt-1">Custom fields, webhooks, API keys, frameworks, and export tools.</p>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-600 mt-1 shrink-0" />
            </div>
          </summary>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 mt-4">
            {advancedItems.map((section) => (
              <Link key={section.href} href={section.href} className="rounded-lg border border-zinc-800 p-5 hover:border-zinc-700 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-zinc-100">{section.title}</h3>
                    <p className="text-sm text-zinc-500 mt-1">{section.description}</p>
                    {section.status ? <div className="mt-2">{section.status}</div> : null}
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-600 mt-1 shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
