// packages/crm/src/app/(dashboard)/clients/[slug]/ready/page.tsx
//
// 2026-05-17 — "Workspace Ready" deliverables hub.
//
// Strategic context: when an agency operator finishes /clients/new, the
// old flow dumped them on /dashboard?ws=<slug> — a generic dashboard
// view showing empty pipelines, empty blocks grid, and no clue that we
// just built them a complete client OS. The Claude Code path through
// finalize_workspace gets a 7-section summary listing the chatbot
// embed, public landing URL, intake form, booking page, etc.; the web
// path got nothing equivalent.
//
// This page is that equivalent. After SSE completes, run-create-from-
// url redirects here instead of /dashboard?ws=<slug>. It renders:
//
//   1. Celebratory hero with the workspace name + public subdomain +
//      "Visit public site" + "Continue to dashboard" CTAs.
//   2. A "What you built in 60 seconds" grid of deliverable cards
//      (Landing / Intake / Booking / Chatbot / CRM / Email), each with
//      the correct PUBLIC url (built via buildWorkspaceUrls so the
//      subdomain matches the new workspace's slug, not the operator's)
//      and a "Customize" admin link via /switch-workspace.
//   3. "Next 3 steps" panel — concrete copy-able actions: test the
//      chatbot, share the public link, add embed snippet to existing
//      site.
//
// Access control: the page redirects to /clients if the user isn't
// authed, or if the workspace they're viewing isn't owned by them
// (matches the previous behaviour where /clients lists only owned
// workspaces).

import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowRight, ExternalLink, Pencil, Sparkles } from "lucide-react";

import { auth } from "@/auth";
import { db } from "@/db";
import { agents, bookings, intakeForms, landingPages, organizations, orgMembers, soulSources } from "@/db/schema";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
// 2026-05-27 — Unified onboarding shell + step-3 completion path.
import { OnboardingShell } from "@/components/onboarding/shell";
import { getOnboardingState } from "@/lib/onboarding/state";
// 2026-05-17 — Invite SMB owner card. Wraps the existing
// /portal/<slug>/login magic-link flow so the agency operator can
// hand off the workspace to its actual SMB owner without copy-pasting
// URLs.
import { InviteSmbOwner } from "./invite-smb-owner";
// 2026-05-22 — Copy-to-clipboard button for the R1 landing URL card.
import { LandingUrlCopyButton } from "./landing-url-copy-button";
// 2026-05-22 — Fallback generate button when R1 generation failed silently.
import { GenerateWebsiteButton } from "./generate-website-button";
// 2026-05-27 — Server action that marks onboarding complete + sends
// the welcome email when the operator clicks "Maybe later" on step 3.
import { dismissOnboardingAction } from "./actions";
// 2026-06-03 — Health/wellness landing-design picker (ready-page swap).
import { ReadyDesignPicker } from "./ready-design-picker";
import { isLandingTemplateId } from "@/components/landing-templates/registry";
import { isHealthVertical, resolveHealthTemplate } from "@/lib/landing/template-selection";
import type { DesignId } from "@/components/clients/design-picker/types";
import { ARCHETYPE_DESIGNS } from "@/components/clients/design-picker/data";
import { classifyArchetypeFromSoul } from "@/lib/workspace/apply-archetype-theme";

export const dynamic = "force-dynamic";

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

type ReadyPageProps = {
  params: Promise<{ slug: string }>;
  // 2026-05-27 — `?completed=1` flips the shell off and shows an
  // inline "You're all set" banner that auto-dismisses after 4s. Set
  // by /settings/domain when a custom-domain save succeeds while the
  // user was in onboarding (the domain save IS the completion event
  // for that branch). The "Maybe later" branch lands somewhere else
  // entirely (the workspace dashboard) so it doesn't need this signal.
  searchParams?: Promise<{ completed?: string }>;
};

export default async function WorkspaceReadyPage({ params, searchParams }: ReadyPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    const { slug } = await params;
    redirect(`/login?callbackUrl=/clients/${slug}/ready`);
  }

  const { slug } = await params;
  if (!slug) redirect("/clients");

  // Resolve the workspace by slug + verify ownership. Without this any
  // signed-in user could view the celebratory page for any workspace
  // (low-impact privacy leak but still worth gating).
  const [workspace] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      ownerId: organizations.ownerId,
      // 2026-05-17 — parentUserId is the agency operator who CREATED
      // this workspace (set by linkWorkspaceToOperator step 7 in
      // run-create-from-url). Without checking it, the original
      // ownerId-only gate would reject the operator on any workspace
      // they created via the v2 flow before the link step ran.
      parentUserId: organizations.parentUserId,
      // 2026-06-03 — theme (current landing template + choice) + soul
      // (vertical) drive the design picker below. settings.crmPersonality
      // is the fallback vertical source when archetype "auto" re-classifies.
      theme: organizations.theme,
      soul: organizations.soul,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!workspace) redirect("/clients");

  // Allow the page if (a) the user is the owner OR (b) they have an
  // org_members row (covers team members + the operator) OR (c) they
  // are the parentUser (agency-managed client workspaces). Same gate
  // /clients uses for the workspace listing.
  //
  // 2026-05-17 — bug fix: previously the membership query did
  // `WHERE org_id = ? LIMIT 1` (no user filter) then compared the
  // first row's userId to the session — so when a workspace had
  // multiple members only the alphabetically-first one passed. Every
  // other agency operator switching INTO that workspace silently
  // redirected back to /clients, which manifested as "switcher did
  // nothing" (the URL flicked to /clients/<slug>/ready, the auth
  // gate redirected back to /clients, the operator never saw it).
  // Now filtered by user_id and parentUserId fallback added.
  const isOwner = workspace.ownerId === session.user.id;
  const isParent = workspace.parentUserId === session.user.id;
  if (!isOwner && !isParent) {
    const [member] = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, workspace.id), eq(orgMembers.userId, session.user.id)))
      .limit(1);
    if (!member) redirect("/clients");
  }

  const urls = buildWorkspaceUrls(workspace.slug, WORKSPACE_BASE_DOMAIN, workspace.id);

  // Build switch-workspace URLs ourselves instead of mutating the
  // `urls.admin_*` strings via .replace() — the URL stored in
  // urls.admin_dashboard is `…/switch-workspace?to=<id>&next=%2Fdashboard`
  // (URL-encoded), so .replace("/dashboard", "/whatever") matches
  // NOTHING and every admin button silently fell back to /dashboard.
  // That was the "Test chatbot redirects to dashboard" bug.
  const sw = (next: string) =>
    `https://${WORKSPACE_BASE_DOMAIN}/switch-workspace?to=${encodeURIComponent(workspace.id)}&next=${encodeURIComponent(next)}`;

  // Query the actual block slugs for the public deep links.
  //
  // Why: buildWorkspaceUrls outputs convenience strings like
  // `${publicOrigin}/book` and `${publicOrigin}/intake` — but the public
  // booking + intake routes need the SPECIFIC template slug
  // (/book/<orgSlug>/<bookingSlug>, /forms/<orgSlug>/<formSlug>). Without
  // the template slug those URLs 404 (you hit that on
  // app.seldonframe.com/book and /forms/<slug>/intake earlier today).
  //
  // We grab the first active template per block — workspace creation
  // seeds exactly one of each via createFullWorkspace, so this lookup is
  // O(1). If a workspace operator later adds a second template (e.g.
  // separate "Free quote" vs "Service call" booking flows), this page
  // still points at the canonical default; the per-template URLs live
  // under /bookings and /forms admin where they belong.
  const [bookingTemplateRow] = await db
    .select({ slug: bookings.bookingSlug, title: bookings.title })
    .from(bookings)
    .where(and(eq(bookings.orgId, workspace.id), eq(bookings.status, "template")))
    .limit(1);

  const [intakeFormRow] = await db
    .select({ slug: intakeForms.slug, name: intakeForms.name })
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, workspace.id), eq(intakeForms.isActive, true)))
    .limit(1);

  // Look up the auto-created website-chatbot agent so the "Test chatbot"
  // card can deep-link straight to /agents/<id>/test (Claude Code style).
  // Workspaces created BEFORE the auto-chatbot wiring landed won't have
  // an agent — for those the card falls back to a "Create chatbot →"
  // CTA pointing at /agents (the user clicks once to provision).
  const [chatbotAgentRow] = await db
    .select({ id: agents.id, slug: agents.slug })
    .from(agents)
    .where(and(eq(agents.orgId, workspace.id), eq(agents.archetype, "website-chatbot")))
    .limit(1);

  // 2026-05-19 — Original client URL lookup. Operators want the "Visit
  // public site" CTA to open the ACTUAL brand website (the URL the
  // operator pasted into /clients/new — e.g. https://roofsbyshiloh.com),
  // not the auto-generated SeldonFrame subdomain. The subdomain is a
  // useful dev preview but it's not the customer-facing brand. We pull
  // the first `type='url'` soul_sources row (seeded by
  // seedSoulWikiSourceUrl / seedSoulWikiFromOnboardingWebsite when the
  // workspace was created) and fall back to the subdomain when no
  // original URL is on file.
  const [originalUrlRow] = await db
    .select({ sourceUrl: soulSources.sourceUrl })
    .from(soulSources)
    .where(and(eq(soulSources.orgId, workspace.id), eq(soulSources.type, "url")))
    .limit(1);
  const originalSiteUrl = originalUrlRow?.sourceUrl ?? null;

  // 2026-05-22 — R1 landing page lookup. Check whether the auto-generated
  // landing page exists for this workspace. We store the existence flag
  // here; the actual URL is built after APP_BASE is defined below.
  const [r1LandingRow] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.orgId, workspace.id),
        eq(landingPages.slug, "r1"),
        eq(landingPages.status, "published"),
      ),
    )
    .limit(1);
  const hasR1Landing = Boolean(r1LandingRow);

  // Public deep links use the canonical /book/<org>/<slug> +
  // /forms/<org>/<slug> patterns on the app host (those routes exist in
  // app/book/[orgSlug]/[bookingSlug] + app/forms/[id]/[formSlug]).
  // We don't use the subdomain shortcuts because proxy.ts's rewrite for
  // /book/* and /forms/* paths is a pass-through — both rely on the
  // orgSlug being in the path, not in the host.
  const APP_BASE = `https://${WORKSPACE_BASE_DOMAIN}`;

  // R1 landing URL — public page at /w/[slug].
  const r1LandingUrl = hasR1Landing ? `${APP_BASE}/w/${workspace.slug}` : null;

  // 2026-07-13 — Landing-design picker, now shown for EVERY workspace on one of
  // two tracks:
  //   • health track   → the 5 premium landing templates (health verticals or a
  //                       workspace that already has a premium template applied)
  //   • archetype track → the 8 aesthetic archetypes (trades/generic verticals)
  // The archetype track re-skins the landing-r1 render (palette/font/hero) — it
  // was already switchable via the SeldonChat copilot; this surfaces the same
  // capability as a click-to-apply picker. `value` is the operator's intent
  // ("auto" or an id); `autoResolvedId` is what Auto maps to for this workspace.
  const wsTheme =
    (workspace.theme as unknown as {
      landingTemplate?: string;
      landingTemplateChoice?: string;
      aestheticArchetype?: string;
      aestheticArchetypeChoice?: string;
    } | null) ?? null;
  const wsVertical = ((workspace.soul as unknown as { industry?: string } | null)?.industry ?? "").toString();
  const currentTemplateId = wsTheme?.landingTemplate;
  const onHealthTrack =
    isLandingTemplateId(currentTemplateId) || isHealthVertical(wsVertical);

  let designChoice: DesignId;
  let designAutoResolved: Exclude<DesignId, "auto"> | undefined;
  let designAutoReason: string;
  let designOptions: typeof ARCHETYPE_DESIGNS | undefined;
  let designSectionLabel: string | undefined;
  let designAutoNote: string | undefined;

  if (onHealthTrack) {
    designChoice = (wsTheme?.landingTemplateChoice as DesignId | undefined) ?? "auto";
    designAutoResolved = (
      isLandingTemplateId(currentTemplateId)
        ? currentTemplateId
        : resolveHealthTemplate(wsVertical)
    ) as Exclude<DesignId, "auto">;
    designAutoReason = wsVertical ? `Auto-picked for ${wsVertical}` : "Auto-picked for this business";
    // health options + copy = the picker defaults; leave undefined.
  } else {
    // Archetype track — trades/generic. Auto resolves via soul classification.
    designChoice = (wsTheme?.aestheticArchetypeChoice as DesignId | undefined) ?? "auto";
    designAutoResolved = (wsTheme?.aestheticArchetype ??
      classifyArchetypeFromSoul(workspace.soul, workspace.settings)) as Exclude<DesignId, "auto">;
    designAutoReason = wsVertical ? `Auto-picked for ${wsVertical}` : "Auto-picked for this business";
    designOptions = ARCHETYPE_DESIGNS;
    designSectionLabel = "Design styles";
    designAutoNote = "Auto matches a style to your business. Pick any style to override it — your site re-skins instantly.";
  }

  const publicBookingUrl = bookingTemplateRow
    ? `${APP_BASE}/book/${workspace.slug}/${bookingTemplateRow.slug}`
    : null;
  const publicIntakeUrl = intakeFormRow
    ? `${APP_BASE}/forms/${workspace.slug}/${intakeFormRow.slug}`
    : null;

  // Public customer-portal URL — this is what the SMB client (the
  // agency's customer) will see and use, no signup required. Different
  // from the agency's own CRM admin which is what /switch-workspace +
  // /contacts opens.
  const publicCustomerPortalUrl = `${APP_BASE}/customer/${workspace.slug}/login`;

  // Chatbot test page — Claude-Code-style live test surface. Opens the
  // workspace's chatbot in a chat-with-it page so the operator can
  // verify it answers questions correctly before sharing.
  const chatbotTestUrl = chatbotAgentRow
    ? sw(`/agents/${chatbotAgentRow.id}/test`)
    : null;

  // Deliverable cards. Two-tier ordering as of 2026-05-17:
  //
  //   1. OPERATOR DASHBOARD — the "Plumbing Owner" view. The most-used
  //      surface for the SMB operator. Lighter version of the agency's
  //      dashboard (Contacts / Deals / Bookings — no Agents / Automations
  //      / Templates since those are agency-only).
  //   2. CUSTOMER PORTAL — what the SMB's end-customers (homeowner Bob /
  //      dental patient / etc.) see. Branded login, no SeldonFrame chrome.
  //
  // These two get a distinct audience label so the operator can't
  // confuse "the dashboard I use to run the business" with "the portal
  // my customer uses to see their appointments."
  //
  // Then: deliverables they can share publicly — booking, intake,
  // chatbot, email, landing. Landing last because the magic isn't the
  // landing page (operator feedback 2026-05-17).
  const deliverables: Array<{
    icon: string;
    /** Who uses this surface. Renders as a chip above the title. */
    audience: "operator" | "end-customer" | "deliverable";
    label: string;
    title: string;
    description: string;
    publicHref: string | null;
    publicLabel: string;
    adminHref: string;
    adminLabel: string;
  }> = [
    {
      icon: "🏠",
      audience: "operator",
      label: "Operator dashboard",
      title: `${workspace.name}'s own admin view`,
      description:
        "What the SMB owner uses to run their business — contacts, deals, bookings, billing. Lighter than the agency view (no agents / automations / templates — those stay in your agency console).",
      publicHref: null,
      publicLabel: "",
      adminHref: sw("/dashboard"),
      adminLabel: "Open operator dashboard",
    },
    {
      icon: "📊",
      audience: "end-customer",
      label: "Customer portal",
      title: "What your client's customers see",
      description:
        "Branded login + portal where the SMB's end-customers (homeowner, patient, client) track their appointments, messages, and documents — no SeldonFrame branding shown.",
      publicHref: publicCustomerPortalUrl,
      publicLabel: "View customer portal →",
      adminHref: sw("/contacts"),
      adminLabel: "Manage portal access",
    },
    {
      icon: "📅",
      audience: "deliverable",
      label: "Booking page",
      title: bookingTemplateRow?.title ?? "Book an appointment",
      description:
        "Public scheduler with the right service types pre-loaded. Syncs to Google Calendar once connected.",
      publicHref: publicBookingUrl,
      publicLabel: publicBookingUrl ? "View public booking →" : "Set up booking",
      adminHref: sw("/bookings"),
      adminLabel: "Edit availability",
    },
    {
      icon: "📝",
      audience: "deliverable",
      label: "Intake form",
      title: intakeFormRow?.name ?? "Request a quote",
      description:
        "Branded form with the fields your client's vertical actually needs. Submissions land in their CRM as contacts. Add more forms anytime.",
      publicHref: publicIntakeUrl,
      publicLabel: publicIntakeUrl ? "View public form →" : "Set up form",
      adminHref: sw("/forms"),
      adminLabel: "Add another form",
    },
    {
      icon: "🤖",
      audience: "deliverable",
      label: "AI chatbot",
      title: "Grounded in their data",
      description:
        "Trained on their site copy + services + hours. Test it like a real customer would, then drop the embed snippet on their existing site.",
      publicHref: chatbotTestUrl,
      publicLabel: chatbotTestUrl ? "Test chatbot →" : "Create chatbot",
      adminHref: sw("/agents"),
      adminLabel: chatbotTestUrl ? "Embed + tune" : "Set up",
    },
    {
      icon: "📨",
      audience: "deliverable",
      label: "Email + SMS",
      title: "Drip + transactional",
      description:
        "Templates wired to lead capture + booking confirmations. Plug in your client's Resend / Twilio keys when ready.",
      publicHref: null,
      publicLabel: "",
      adminHref: sw("/emails"),
      adminLabel: "Set up channels",
    },
    // 2026-05-22 — R1 landing page card. Auto-generated at workspace
    // creation by the R-framework pipeline. Public at /w/[slug].
    // Only shown when the generation succeeded (r1LandingUrl is non-null).
    ...(r1LandingUrl
      ? [
          {
            icon: "🌐",
            audience: "deliverable" as const,
            label: "Public landing page",
            title: "Polished public website",
            description:
              "Auto-generated from their business data — hero, services, testimonials, FAQ, and footer. Share the link with your client immediately or open it to review the copy.",
            publicHref: r1LandingUrl,
            publicLabel: "View public site →",
            adminHref: r1LandingUrl,
            adminLabel: "Open in new tab",
          },
        ]
      : []),
    // 2026-05-23 — Production-setup quick link. After dogfooding, operators
    // consistently asked "how do I swap the SeldonFrame subdomain for the
    // client's own domain?" — the answer (Settings → Domain) was buried.
    //
    // 2026-05-27 — PROMOTED out of the deliverable grid into its own
    // prominent "Make it yours" section above the grid. The Ready page
    // is the terminal screen of the BYOK-first onboarding arc; step 3
    // is "connect a custom domain", which is also the new upgrade
    // trigger (see /settings/domain). Surfacing it as a sibling tile
    // among 5 other deliverables buried the nudge. The dedicated
    // section is rendered inline in the JSX below — no array entry
    // needed here anymore.
  ];

  // Audience chip styling. The two foundational cards (operator dashboard
  // + customer portal) get colored chips so the "who uses this?" answer
  // is unmistakable at a glance. Plain deliverable cards get a neutral
  // chip — they're the same surface for both audiences (booking page is
  // a booking page).
  const AUDIENCE_CHIP: Record<typeof deliverables[number]["audience"], { label: string; cls: string }> = {
    "operator": {
      label: "FOR THE SMB OWNER",
      cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    "end-customer": {
      label: "FOR THEIR CUSTOMERS",
      cls: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    },
    "deliverable": {
      label: "PUBLIC DELIVERABLE",
      cls: "border-border/70 bg-muted/30 text-muted-foreground",
    },
  };

  // 2026-05-27 — Onboarding state for the shell + the Maybe-later
  // dismissal CTA. Computed once here so the JSX branches don't
  // re-call the helper for each section that needs it.
  //
  // The Ready page is step 3 of the arc; if the user is still mid-
  // onboarding their `currentStep` should be exactly 3 (they reached
  // here by completing the build, which is the gate for step 2 → 3).
  // If they're already completed (returning operator viewing a
  // previously-built workspace), the shell and the Maybe-later CTA
  // both disappear and the page renders in its evergreen form.
  const onboardingState = await getOnboardingState(session.user.id);
  const showShell =
    !onboardingState.completed && onboardingState.currentStep === 3;
  // 2026-05-27 — Inline celebration banner shown when /settings/domain
  // bounced us back here with ?completed=1 (the custom-domain success
  // path that marks onboarding complete). Auto-dismiss is handled by
  // the existing UI — we just render the banner statically and let the
  // page re-render on next navigation clear it.
  const sp = await searchParams;
  const justCompleted = sp?.completed === "1";

  return (
    <main className="animate-page-enter w-full flex-1 overflow-auto" style={{ minHeight: "calc(100vh - 9rem)" }}>
      {/* 2026-05-27 — Onboarding shell strip. Only renders while the
          operator is mid-arc. Once they complete (either path), this
          page goes back to its non-onboarding layout — no shell, no
          Maybe-later CTA, no celebration banner. */}
      {showShell && onboardingState.display ? (
        <OnboardingShell
          step={onboardingState.display.step}
          total={onboardingState.display.total}
          title="Make it yours"
        />
      ) : null}
      <div className="mx-auto max-w-5xl p-4 sm:p-6 md:p-8">
      {justCompleted ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200"
        >
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">You&apos;re all set.</span>{" "}
            Your workspace is live and your domain is connected. Welcome
            aboard.
          </span>
        </div>
      ) : null}
      <div className="space-y-10">
        {/* ============== HERO ============== */}
        <header className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Workspace ready — 60 seconds
          </div>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
            <span className="text-foreground">{workspace.name}</span>{" "}
            <span className="text-muted-foreground">is live.</span>
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            CRM, booking, intake, and AI chatbot — all wired together and
            published at{" "}
            <span className="font-medium text-foreground">
              {workspace.slug}.{WORKSPACE_BASE_DOMAIN}
            </span>
            . Share the public URL with your client or keep tuning before you do.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href={sw("/dashboard")}
              className="crm-pressable inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-(--shadow-sm) transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90"
            >
              Open {workspace.name}'s dashboard
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href={originalSiteUrl ?? urls.home}
              target="_blank"
              rel="noreferrer noopener"
              className="crm-pressable inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card/60 px-5 text-sm font-medium text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-card"
            >
              {originalSiteUrl ? "Visit public site" : "Visit preview site"}
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </div>
        </header>

        {/* ============== R1 LANDING URL CARD ==============
            2026-05-22 — surfaces the auto-generated public landing
            page URL with copy-to-clipboard + open-in-new-tab.
            When R1 generation succeeded (r1LandingUrl is non-null):
              → show the URL card with a prominent Customize button.
            When R1 generation failed silently (hasR1Landing is false):
              → show a dashed amber fallback card with GenerateWebsiteButton. */}
        {r1LandingUrl ? (
          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-xl leading-none">🌐</span>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Client&apos;s website is live
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                {workspace.name}&apos;s public landing page
              </p>
              <p className="text-xs text-muted-foreground">
                Auto-generated from their business data. Share this link with your client immediately.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-mono text-foreground">
                {r1LandingUrl}
              </code>
              <LandingUrlCopyButton url={r1LandingUrl} />
              <a
                href={r1LandingUrl}
                target="_blank"
                rel="noreferrer"
                className="crm-pressable inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-3 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-background hover:text-foreground"
              >
                Open
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
              {/* 2026-05-22 — Phase T: natural-language editor link.
                  Bumped to primary visual weight (filled bg, heavier border)
                  so the operator's entry point for editing is unmistakable. */}
              <Link
                href={`/clients/${workspace.slug}/landing/edit`}
                className="crm-pressable inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-(--shadow-sm) transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Customize website
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-xl leading-none">⚠️</span>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                Website generation pending
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                We didn&apos;t auto-generate the public website for this workspace.
              </p>
              <p className="text-sm text-muted-foreground">
                This happens occasionally on first try. Click below to generate it now — takes ~10 seconds.
              </p>
            </div>
            <GenerateWebsiteButton workspaceSlug={workspace.slug} />
          </section>
        )}

        {/* ============== LANDING DESIGN PICKER ==============
            2026-07-13 — Every workspace can swap its public landing design
            here. Health verticals pick among the 5 premium templates; every
            other vertical (plumbing, HVAC, electrical, landscaping, …) picks
            among the 8 aesthetic archetypes, which re-skin the landing-r1
            render. "Change design" reopens the picker and re-renders /w/[slug]. */}
        <section className="rounded-2xl border border-border/70 bg-card/40 p-5">
          <ReadyDesignPicker
            slug={workspace.slug}
            initialValue={designChoice}
            autoResolvedId={designAutoResolved}
            autoReason={designAutoReason}
            designs={designOptions}
            sectionLabel={designSectionLabel}
            autoNote={designAutoNote}
          />
        </section>

        {/* ============== AUDIENCE-SCOPED CARDS ==============
            Two-row layout: foundational surfaces (operator dashboard +
            customer portal) get their own promoted row at the top so
            the audience distinction is obvious; deliverables (booking,
            intake, chatbot, etc.) fill the grid below. */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Two views, two audiences
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {deliverables
              .filter((d) => d.audience !== "deliverable")
              .map((d) => {
                const chip = AUDIENCE_CHIP[d.audience];
                return (
                  <article
                    key={d.label}
                    className="crm-hover-lift flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/55 p-5"
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="text-2xl leading-none">
                          {d.icon}
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {d.label}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] ${chip.cls}`}
                      >
                        {chip.label}
                      </span>
                    </div>
                    <h2 className="text-base font-semibold text-foreground">{d.title}</h2>
                    <p className="text-xs text-muted-foreground">{d.description}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                      {d.publicHref ? (
                        <a
                          href={d.publicHref}
                          target="_blank"
                          rel="noreferrer"
                          className="crm-pressable inline-flex h-8 items-center gap-1 rounded-lg bg-primary/15 px-2.5 text-xs font-medium text-primary transition-[background-color,transform] duration-150 ease-out hover:bg-primary/25"
                        >
                          {d.publicLabel}
                        </a>
                      ) : null}
                      <Link
                        href={d.adminHref}
                        className="crm-pressable inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background/40 px-2.5 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-background/80 hover:text-foreground"
                      >
                        {d.adminLabel}
                      </Link>
                      {/* 2026-05-17 — Operator card gets an extra
                          "Invite SMB owner" affordance that fires
                          the operator-portal magic link so the SMB
                          can sign in to their own workspace at
                          /portal/<slug>/. End-customer + deliverable
                          cards don't show this. */}
                      {d.audience === "operator" ? (
                        <InviteSmbOwner
                          workspaceSlug={workspace.slug}
                          workspaceName={workspace.name}
                          portalLoginUrl={`${APP_BASE}/portal/${workspace.slug}/login`}
                          invitedByName={session.user.name ?? undefined}
                        />
                      ) : null}
                    </div>
                  </article>
                );
              })}
          </div>
        </section>

        {/* ============== MAKE IT YOURS (CUSTOM DOMAIN NUDGE) ==============
            2026-05-27 — Step 3 of the BYOK-first onboarding arc. The
            workspace is built (step 2 = clients/new); the natural next
            move is making it feel premium with a custom domain. This
            section is intentionally promoted out of the deliverable
            grid into its own row so the arc reads:
              hero → audience cards → "make it yours" → deliverables → next steps
            instead of "connect domain" being one of 6 equal tiles.
            /settings/domain itself enforces the tier gate (free + no
            card → upsell card; paid OR free + card → real form). */}
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-xl leading-none">🔗</span>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Step 3 — Make it yours
                </p>
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Make it yours
              </h2>
              {/* 2026-05-27 — In-onboarding copy uses loss-aversion
                  framing per the research: "Your client sees X right
                  now. Fix it before they see it." Returning operators
                  (showShell=false) see the evergreen "point your
                  client's domain at this site" copy instead. */}
              {showShell ? (
                <p className="text-sm text-muted-foreground">
                  Right now your client sees{" "}
                  <code className="rounded bg-muted/50 px-1.5 py-0.5 text-xs font-mono text-foreground">
                    {workspace.slug}.{WORKSPACE_BASE_DOMAIN}
                  </code>
                  . Connect a custom domain so the workspace lives at{" "}
                  <span className="font-medium text-foreground">{workspace.slug}.com</span>{" "}
                  before you share the link.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Point your client&apos;s existing domain at this site so it
                  lives at <span className="font-medium text-foreground">{workspace.slug}.com</span>{" "}
                  instead of{" "}
                  <code className="rounded bg-muted/50 px-1.5 py-0.5 text-xs font-mono text-foreground">
                    {workspace.slug}.{WORKSPACE_BASE_DOMAIN}
                  </code>
                  .
                </p>
              )}
            </div>
            {/* 2026-05-27 — Two CTAs when in onboarding: primary
                "Connect custom domain" → /settings/domain (which gates
                to the upsell card for free-tier-no-card users), AND
                "Maybe later" → dismissOnboardingAction which marks
                onboarding complete and redirects to the workspace
                dashboard. Returning operators see only the connect
                button — there's nothing to dismiss. */}
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start">
              {/* In-onboarding: pass ?onboardingWorkspaceSlug=<slug>
                  so /settings/domain knows where to bounce the user
                  back to (with ?completed=1) after a successful save.
                  Returning operators get the bare /settings/domain link
                  since they don't need the post-save redirect. */}
              <Link
                href={
                  showShell
                    ? `/settings/domain?onboardingWorkspaceSlug=${encodeURIComponent(workspace.slug)}`
                    : "/settings/domain"
                }
                className="crm-pressable inline-flex h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-(--shadow-sm) transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90"
              >
                Connect custom domain
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              {showShell ? (
                <form action={dismissOnboardingAction}>
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <input type="hidden" name="workspaceSlug" value={workspace.slug} />
                  <input type="hidden" name="baseDomain" value={WORKSPACE_BASE_DOMAIN} />
                  <button
                    type="submit"
                    className="crm-pressable inline-flex h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-xl border border-border bg-card/60 px-4 text-sm font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-card hover:text-foreground"
                  >
                    Maybe later →
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </section>

        {/* ============== DELIVERABLE GRID ============== */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            What you built in 60 seconds
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deliverables
              .filter((d) => d.audience === "deliverable")
              .map((d) => (
                <article
                  key={d.label}
                  className="crm-hover-lift flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/40 p-5"
                >
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden="true" className="text-xl leading-none">
                      {d.icon}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {d.label}
                    </span>
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">{d.title}</h2>
                  <p className="text-xs text-muted-foreground">{d.description}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                    {d.publicHref ? (
                      <a
                        href={d.publicHref}
                        target="_blank"
                        rel="noreferrer"
                        className="crm-pressable inline-flex h-8 items-center gap-1 rounded-lg bg-primary/15 px-2.5 text-xs font-medium text-primary transition-[background-color,transform] duration-150 ease-out hover:bg-primary/25"
                      >
                        {d.publicLabel}
                      </a>
                    ) : null}
                    <Link
                      href={d.adminHref}
                      className="crm-pressable inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background/40 px-2.5 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-background/80 hover:text-foreground"
                    >
                      {d.adminLabel}
                    </Link>
                  </div>
                </article>
              ))}
          </div>
        </section>

        {/* ============== NEXT STEPS ============== */}
        <section className="rounded-2xl border border-border/70 bg-card/30 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Next 3 steps
          </p>
          <ol className="mt-4 space-y-3">
            {[
              {
                step: "1",
                title: "Test the chatbot",
                detail: (
                  <>
                    Open{" "}
                    <a href={originalSiteUrl ?? urls.home} target="_blank" rel="noreferrer noopener" className="font-medium text-primary underline underline-offset-2">
                      {originalSiteUrl ? "the public site" : "the preview site"}
                    </a>{" "}
                    and ask the chatbot a question like &ldquo;what are your hours?&rdquo;
                    or &ldquo;do you do emergency calls?&rdquo;
                  </>
                ),
              },
              {
                step: "2",
                title: "Share the public link with your client",
                detail: (
                  <>
                    Send them{" "}
                    <code className="rounded bg-muted/40 px-1 py-0.5 text-xs">
                      {workspace.slug}.{WORKSPACE_BASE_DOMAIN}
                    </code>{" "}
                    so they can see what their new Business OS looks like.
                  </>
                ),
              },
              {
                step: "3",
                title: "Embed the chatbot on their existing site",
                detail: (
                  <>
                    Grab the embed snippet from{" "}
                    <Link
                      href={sw("/agents")}
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      Agents
                    </Link>
                    {" "}and paste it before the closing &lt;/body&gt; tag on their current site.
                  </>
                ),
              },
            ].map((item) => (
              <li key={item.step} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                  {item.step}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ============== SEND PROPOSAL CTA ==============
            2026-05-21 — Phase L. After building a workspace for a
            prospect, the natural next commercial step is sending them
            a proposal so they can sign up and pay. This section makes
            that next step obvious without hunting for /proposals. */}
        <section className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Next step</p>
            <h2 className="text-xl font-semibold tracking-tight">Send a proposal for this workspace</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Now that the workspace is built, send a branded proposal to your prospect. They&apos;ll see a live preview of what you&apos;ve built — and can sign up directly via Stripe.
          </p>
          <Link
            href={`/proposals/new?workspace=${encodeURIComponent(workspace.id)}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Send proposal →
          </Link>
        </section>

        <div className="flex justify-center pt-2">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            ← Back to my agency dashboard
          </Link>
        </div>
      </div>
      </div>
    </main>
  );
}
