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

  // v1.29.0 — restructured into 5 plain-English buckets. Operators don't
  // need to learn "Soul" / "Brain" / "framework" jargon to set up their
  // business. Power-user / SF-internal stuff routes through Developer.
  //
  //   1. Workspace         — name, profile, timezone, brand
  //   2. Billing            — plan, payments, custom domain
  //   3. Integrations       — LLM keys, email/SMS providers, Google Cal
  //   4. CRM setup          — pipeline stages, custom fields, suppression,
  //                           client portal, knowledge base
  //   5. Developer          — API keys, webhooks, soul export/import,
  //                           saved framework presets (collapsed; only
  //                           visible to operators who know they need it)
  const primaryGroups = [
    {
      id: "workspace",
      title: "Workspace",
      description: "Your business identity — name, brand, profile.",
      items: [
        {
          href: "/settings/workspace",
          title: "Workspace",
          description: "Workspace name, timezone, public URLs",
          status: <span className="text-xs text-zinc-400">{orgRow?.timezone ?? "UTC"}</span>,
        },
        {
          href: "/settings/profile",
          title: "Business Profile",
          description: "Name, industry, description — used by your AI assistants",
          status: null,
        },
        {
          href: "/settings/theme",
          title: "Brand & Theme",
          description: "Colors, fonts, logo for your public pages and chatbot",
          status: (
            <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
              <span className="h-2.5 w-2.5 rounded-full border border-zinc-600" style={{ backgroundColor: themeSettings?.theme.primaryColor || "#14b8a6" }} />
              {themeSettings?.theme.primaryColor || "Primary color"}
            </span>
          ),
        },
        {
          href: "/settings/team",
          title: "Team",
          description: "Members and roles",
          status: <span className="text-xs text-zinc-400">{teamCount} member{teamCount === 1 ? "" : "s"}</span>,
        },
      ],
    },
    {
      id: "billing",
      title: "Billing",
      description: "Your plan, payments, and custom domain.",
      items: [
        {
          href: "/settings/billing",
          title: "Plan & Subscription",
          description: "Plan tier, billing cycle, and Stripe customer portal",
          status: <span className="text-xs text-zinc-400">{billingStatus}</span>,
        },
        {
          href: "/settings/payments",
          title: "Accept Payments",
          description: "Connect Stripe to charge for bookings, services, or subscriptions",
          status: stripeStatus ? (
            <span className="text-xs text-emerald-400">Connected</span>
          ) : (
            <span className="text-xs text-zinc-400">Not connected</span>
          ),
        },
        {
          href: "/settings/domain",
          title: "Custom Domain",
          description: "Use your own domain for booking pages, forms, and the chat widget",
          status: <span className="text-xs text-zinc-400">{domainStatus}</span>,
        },
      ],
    },
    {
      id: "integrations",
      title: "Integrations",
      description: "Connect the tools your business already uses.",
      items: [
        {
          href: "/settings/integrations/llm",
          title: "AI / LLM Provider",
          description: "Anthropic or OpenAI key — powers your AI assistants",
          status: (() => {
            const anthropicCfg = (integrations as Record<string, unknown>).anthropic as
              | { apiKey?: string }
              | undefined;
            const openaiCfg = (integrations as Record<string, unknown>).openai as
              | { apiKey?: string }
              | undefined;
            const has = Boolean(anthropicCfg?.apiKey || openaiCfg?.apiKey);
            return (
              <span className={`text-xs ${has ? "text-emerald-400" : "text-amber-400"}`}>
                {has ? "Configured" : "Not configured"}
              </span>
            );
          })(),
        },
        {
          href: "/settings/integrations",
          title: "Other Integrations",
          description: "Email (Resend), SMS (Twilio), newsletters (Kit), Google Calendar",
          status: <span className="text-xs text-zinc-400">{connectedIntegrations} connected</span>,
        },
      ],
    },
    {
      id: "crm",
      title: "CRM Setup",
      description: "Tune how customers, deals, and bookings work for your business.",
      items: [
        {
          href: "/settings/pipeline",
          title: "Pipeline Stages",
          description: `Stages that ${labels.deal.plural.toLowerCase()} move through (lead → won)`,
          status: <span className="text-xs text-zinc-400">{pipelineStagesCount} stages</span>,
        },
        {
          href: "/settings/fields",
          title: "Custom Fields",
          description: "Add fields specific to your business (warranty type, SQFT, etc.)",
          status: null,
        },
        {
          href: "/settings/client-portal",
          title: "Customer Portal",
          description: "Private dashboard where customers see their bookings + messages",
          status: <span className="text-xs text-zinc-400">{portalStatus}</span>,
        },
        {
          href: "/settings/soul-wiki",
          title: "Knowledge Base",
          description: "Feed your AI assistants your website, FAQs, and policy documents",
          status: <span className="text-xs text-zinc-400">{soulSourceCount} sources · {soulArticleCount} articles</span>,
        },
        {
          href: "/settings/suppression",
          title: "Suppression List",
          description: "Email/phone opt-outs for compliance",
          status: null,
        },
      ],
    },
  ] as const;

  // v1.29.0 — Developer / power-user surfaces. Default-collapsed.
  // Operators who don't know they need these never have to see them.
  const advancedItems = [
    { href: "/settings/api", title: "API Keys", description: "Programmatic access for custom integrations", status: null },
    { href: "/settings/webhooks", title: "Webhooks", description: "Push events to external services", status: null },
    { href: "/settings/branding", title: "White-label Branding", description: "Hide 'Powered by SeldonFrame' (agency tier)", status: brandingStatus ? <span className="text-xs text-emerald-400">{brandingStatus}</span> : null },
    { href: "/settings/frameworks", title: "Industry Packs", description: "Reusable presets for industry-specific setups", status: <span className="text-xs text-zinc-400">{frameworksStatus}</span> },
    { href: "/settings/soul-transfer", title: "Export / Import", description: "Download or upload your full workspace configuration as JSON", status: null },
  ] as const;

  return (
    <section className="animate-page-enter space-y-6 sm:space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your workspace, plan, integrations, and CRM. Everything is editable.</p>
      </div>

      <div className="space-y-4">
        {primaryGroups.map((group) => (
          <article key={group.id} className="rounded-xl border bg-card p-5 space-y-4">
            <div>
              <p className="font-semibold text-foreground">{group.title}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{group.description}</p>
            </div>

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

        <details className="rounded-xl border bg-card p-5">
          <summary className="cursor-pointer list-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">Developer</p>
                <p className="text-sm text-muted-foreground mt-0.5">For power users — API keys, webhooks, white-label, export/import. Most operators never need this.</p>
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
