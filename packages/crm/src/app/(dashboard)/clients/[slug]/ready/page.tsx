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
import { ArrowRight, ExternalLink, Sparkles } from "lucide-react";

import { auth } from "@/auth";
import { db } from "@/db";
import { agents, bookings, intakeForms, organizations, orgMembers } from "@/db/schema";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";

export const dynamic = "force-dynamic";

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

type ReadyPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function WorkspaceReadyPage({ params }: ReadyPageProps) {
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
    })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!workspace) redirect("/clients");

  // Allow the page if (a) the user is the owner OR (b) they have an
  // org_members row (covers team members + the operator). Same gate
  // /clients uses for the workspace listing.
  const isOwner = workspace.ownerId === session.user.id;
  if (!isOwner) {
    const [member] = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(eq(orgMembers.orgId, workspace.id))
      .limit(1);
    if (!member || member.userId !== session.user.id) redirect("/clients");
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

  // Public deep links use the canonical /book/<org>/<slug> +
  // /forms/<org>/<slug> patterns on the app host (those routes exist in
  // app/book/[orgSlug]/[bookingSlug] + app/forms/[id]/[formSlug]).
  // We don't use the subdomain shortcuts because proxy.ts's rewrite for
  // /book/* and /forms/* paths is a pass-through — both rely on the
  // orgSlug being in the path, not in the host.
  const APP_BASE = `https://${WORKSPACE_BASE_DOMAIN}`;
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

  // Deliverable cards. Ordered by what the operator wants to test +
  // share with their client FIRST. User feedback (2026-05-17): "the
  // magic of SeldonFrame isn't in creating the landing page" → CRM
  // customer portal goes first, landing goes last.
  //
  // Order: CRM portal → Booking → Intake → Chatbot → Email → Landing.
  const deliverables: Array<{
    icon: string;
    label: string;
    title: string;
    description: string;
    publicHref: string | null;
    publicLabel: string;
    adminHref: string;
    adminLabel: string;
  }> = [
    {
      icon: "📊",
      label: "Customer portal",
      title: "What your client's customers see",
      description:
        "Branded login + portal where your client's customers track appointments, messages, and documents — without signing into anything SeldonFrame-branded.",
      publicHref: publicCustomerPortalUrl,
      publicLabel: "View customer portal →",
      adminHref: sw("/contacts"),
      adminLabel: "Open CRM admin",
    },
    {
      icon: "📅",
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
      label: "Email + SMS",
      title: "Drip + transactional",
      description:
        "Templates wired to lead capture + booking confirmations. Plug in your client's Resend / Twilio keys when ready.",
      publicHref: null,
      publicLabel: "",
      adminHref: sw("/emails"),
      adminLabel: "Set up channels",
    },
    {
      icon: "🌐",
      label: "Landing page",
      title: "Optional public site",
      description: `Default landing at ${workspace.slug}.${WORKSPACE_BASE_DOMAIN}. Most agencies prefer to embed the chatbot + booking on the client's existing site rather than replace it.`,
      publicHref: urls.home,
      publicLabel: "View landing →",
      adminHref: sw("/landing"),
      adminLabel: "Edit landing",
    },
  ];

  return (
    <main className="animate-page-enter mx-auto flex-1 overflow-auto w-full max-w-5xl p-4 sm:p-6 md:p-8">
      <div className="space-y-10">
        {/* ============== HERO ============== */}
        <header className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Workspace ready — 60 seconds
          </div>
          <h1 className="text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl lg:text-[2.75rem]">
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
            <a
              href={urls.home}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-(--shadow-sm) transition-colors hover:bg-primary/90"
            >
              Visit public site
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
            <Link
              href={sw("/dashboard")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card/60 px-5 text-sm font-medium text-foreground transition-colors hover:bg-card"
            >
              Continue to dashboard
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </header>

        {/* ============== DELIVERABLE GRID ============== */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            What you built in 60 seconds
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deliverables.map((d) => (
              <article
                key={d.label}
                className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/40 p-5"
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
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary/15 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/25"
                    >
                      {d.publicLabel}
                    </a>
                  ) : null}
                  <Link
                    href={d.adminHref}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background/40 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
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
                    <a href={urls.home} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
                      the public site
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

        <div className="flex justify-center pt-2">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            ← Back to my agency dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
