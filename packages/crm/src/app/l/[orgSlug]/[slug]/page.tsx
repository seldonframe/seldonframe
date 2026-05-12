import { notFound } from "next/navigation";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { PageRenderer } from "@/components/landing/page-renderer";
import { ChatbotEmbedScript } from "@/components/landing/chatbot-script";
import { VisitBeacon } from "@/components/landing/visit-beacon";
import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";
import { getPublicLandingPage } from "@/lib/landing/actions";
import { getPublicOrgThemeById } from "@/lib/theme/actions";
import { getPublicChatbotEmbed } from "@/lib/agents/public-embed";
import type { LandingSection } from "@/lib/landing/types";

// Enable ISR with a 1-hour default revalidation window. On explicit
// publish we also call revalidatePath from publishLandingPageAction
// to bust the cache immediately. Visit tracking moved to a client
// beacon (see VisitBeacon) so the cached page still emits one
// landing.visited event per real browser view.
export const revalidate = 3600;

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; slug: string }>;
}) {
  const { orgSlug, slug } = await params;
  const payload = await getPublicLandingPage(orgSlug, slug);

  if (!payload) {
    notFound();
  }

  const showBadge = await shouldShowPoweredByBadgeForOrg(payload.orgId);
  const theme = await getPublicOrgThemeById(payload.orgId);
  // v1.40.7 — workspace-level chatbot embed.
  const chatbotEmbed = await getPublicChatbotEmbed(payload.orgId);

  // v1.38.4 — force light mode on customer-facing landing pages.
  //
  // Same fix v1.36.3 applied to the booking page, now extended here.
  // Industry convention (Cal.com, Calendly, Squarespace, every SMB
  // builder): customer-facing pages default to light. Operators tune
  // their dashboard to whatever they want, but the public-facing
  // surface should be readable + clean by default. Workspaces whose
  // operators specifically want a dark public site can opt-in later.
  //
  // Two layers of override (both required because of how Tailwind v4
  // resolves dark-mode utilities):
  //   1. theme.mode = "light"  → fixes our --sf-* CSS variables
  //   2. className="light"     → prevents Tailwind's `bg-card`,
  //      `text-foreground` etc. from resolving to the global `.dark`
  //      variants. Without this, our --sf-bg goes white but
  //      `bg-card` stays dark because it points at `--card` which is
  //      controlled globally.
  const publicTheme = { ...theme, mode: "light" as const };

  // v1.44.0 — priority flipped: prefer sections (React PageRenderer with
  // hero-template dispatch + Framer Motion) when populated. Fall back to
  // the legacy contentHtml static-HTML render only when sections is
  // empty/null. Reason: sections is the richer path — it dispatches to
  // HERO_TEMPLATES[template] via hero.tsx for hero blocks, and falls
  // through to default React components for everything else. contentHtml
  // is the v1.4 per-block builder's output, kept for backward compat
  // with workspaces that haven't been re-built since v1.44 deployed.
  const sections =
    (payload.page.sections as LandingSection[] | null | undefined) ?? [];
  const useSectionsRenderer = sections.length > 0;

  if (useSectionsRenderer) {
    return (
      <PublicThemeProvider theme={publicTheme}>
        <main className="light min-h-screen" style={{ backgroundColor: "var(--sf-bg)", color: "var(--sf-text)" }}>
          <PageRenderer sections={sections} />
          {showBadge ? (
            <div className="flex justify-center py-4" style={{ borderTop: "1px solid var(--sf-border)", backgroundColor: "color-mix(in oklab, var(--sf-bg) 92%, var(--sf-accent) 8%)" }}>
              <PoweredByBadge />
            </div>
          ) : null}
          <VisitBeacon pageId={payload.page.id} />
          {chatbotEmbed ? <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} /> : null}
        </main>
      </PublicThemeProvider>
    );
  }

  if (payload.page.contentHtml && payload.page.contentCss) {
    return (
      <PublicThemeProvider theme={publicTheme}>
        <main className="light min-h-screen" style={{ backgroundColor: "var(--sf-bg)", color: "var(--sf-text)" }}>
          <style dangerouslySetInnerHTML={{ __html: payload.page.contentCss }} />
          <div dangerouslySetInnerHTML={{ __html: payload.page.contentHtml }} />
          {showBadge ? (
            <div className="flex justify-center py-4" style={{ borderTop: "1px solid var(--sf-border)", backgroundColor: "color-mix(in oklab, var(--sf-bg) 92%, var(--sf-accent) 8%)" }}>
              <PoweredByBadge />
            </div>
          ) : null}
          <VisitBeacon pageId={payload.page.id} />
          {chatbotEmbed ? <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} /> : null}
        </main>
      </PublicThemeProvider>
    );
  }

  // Last-resort: empty page when neither sections nor contentHtml exist.
  // PageRenderer renders nothing for an empty array, which is the correct
  // visual state for a workspace that hasn't been enhanced yet.
  return (
    <PublicThemeProvider theme={publicTheme}>
      <main className="light min-h-screen" style={{ backgroundColor: "var(--sf-bg)", color: "var(--sf-text)" }}>
        <PageRenderer sections={[]} />
        {showBadge ? (
          <div className="flex justify-center py-4" style={{ borderTop: "1px solid var(--sf-border)", backgroundColor: "color-mix(in oklab, var(--sf-bg) 92%, var(--sf-accent) 8%)" }}>
            <PoweredByBadge />
          </div>
        ) : null}
        <VisitBeacon pageId={payload.page.id} />
        {chatbotEmbed ? <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} /> : null}
      </main>
    </PublicThemeProvider>
  );
}
