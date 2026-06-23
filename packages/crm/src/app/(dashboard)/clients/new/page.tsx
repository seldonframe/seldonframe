// packages/crm/src/app/(dashboard)/clients/new/page.tsx
// Server component for the post-signup "paste a URL" screen.
// Spec §"New frontend page" (Cut A).
//
// Auth gate: redirect unauthenticated users to /login with a callbackUrl
// so they return here after signing in.
//
// 2026-05-19 — Phase 8: accept ?source=proposal so the proposal acceptance
// flow can link here in compact mode (suppresses agency onboarding chrome).
//
// 2026-05-22 — Accept ?url=, ?biz=, ?intent= so the marketing prompt
// signal survives the signup → magic-link → /signup/billing → here
// round trip. ?intent=build (in combination with ?url= or ?biz=) triggers
// auto-submit on mount so the build animation kicks off without a
// second click — preserving the marketing-site mental model "type URL,
// build starts immediately".
//
// 2026-05-23 — Bug #1: the client form ALSO reads localStorage on
// mount and hydrates the form. Long paste payloads (`biz`) never
// travel through the URL chain anymore — they live in
// localStorage('sf-workspace-seed'). Short URLs still pass via ?url=
// as a fallback for users with localStorage disabled.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingShell } from "@/components/onboarding/shell";
import { getOnboardingState } from "@/lib/onboarding/state";
import { ClientsNewForm } from "./clients-new-form";

export const dynamic = "force-dynamic";

export default async function ClientsNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    url?: string;
    biz?: string;
    intent?: string;
    // 2026-06-23 — Programmatic SEO/GEO deploy CTA. The /agents/* pages link
    // here as ?agent=<starter-pack-id>&intent=build (+ optional ?vertical=).
    // `agent` names the canonical starter the visitor wants instantiated; it
    // is threaded through the form into the build SSE so the pipeline can fork
    // that starter post-build (see clients-new-form.tsx + the create-from-url
    // route's `agent` seam). `vertical` is a niche hint for the build.
    agent?: string;
    vertical?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    // Preserve the agent/vertical/intent params across the login round-trip so
    // a cold visitor who must sign in still lands back here carrying the agent.
    const cb = new URLSearchParams();
    const sp = await searchParams;
    if (sp.agent) cb.set("agent", sp.agent);
    if (sp.vertical) cb.set("vertical", sp.vertical);
    if (sp.intent) cb.set("intent", sp.intent);
    const qs = cb.toString();
    redirect(`/login?callbackUrl=${encodeURIComponent(`/clients/new${qs ? `?${qs}` : ""}`)}`);
  }

  const { source, url, biz, intent, agent, vertical } = await searchParams;

  // Trim + sanitize the inbound prefill values. We don't validate the
  // URL shape here — IdleScene's <UrlInput type="url"> handles client-
  // side validation, and the SSE create-from-url endpoint validates
  // again server-side. Length cap mirrors buildSignupNextPath() so a
  // hostile redirect can't fingerprint /clients/new with megabyte
  // query strings.
  const prefillUrl =
    typeof url === "string" && url.trim().length > 0
      ? url.trim().slice(0, 1024)
      : null;
  const prefillBiz =
    typeof biz === "string" && biz.trim().length > 0
      ? biz.trim().slice(0, 1024)
      : null;
  // 2026-05-23 — Auto-submit when ?intent=build is set. The form's
  // mount effect resolves the actual payload from URL query first,
  // then falls back to localStorage('sf-workspace-seed') for long
  // paste payloads that no longer travel through the URL chain. If
  // neither source has a payload, the auto-submit gracefully no-ops
  // (the user is left at the IdleScene with empty inputs).
  const autoSubmit = intent === "build";

  // 2026-06-23 — Sanitize the SEO deploy params. Both are short, slug-shaped
  // (lowercase, hyphenated) — clamp + restrict the charset so a hostile link
  // can't smuggle anything into the SSE query string we build from them.
  const slugish = (v: string | undefined): string | null => {
    if (typeof v !== "string") return null;
    const cleaned = v.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64);
    return cleaned.length > 0 ? cleaned : null;
  };
  const prefillAgent = slugish(agent);
  const prefillVertical = slugish(vertical);

  // 2026-05-27 — Unified onboarding shell. Render the step-2 strip only
  // for users still mid-onboarding. Returning operators who already
  // built a workspace see /clients/new as the normal "new workspace"
  // form (no header strip, no "Step 2 of 3" — they're past the arc).
  // We're already past the auth gate so session.user.id is non-null.
  const onboardingState = await getOnboardingState(session.user.id);
  const showShell =
    !onboardingState.completed && onboardingState.currentStep === 2;

  return (
    // Phase P2: full-bleed main so the IdleScene canvas can fill the entire
    // available content area (right of sidebar, below the dashboard
    // breadcrumb). The Stage scales the 720×960 canvas to fit both
    // dimensions of this container.
    //
    // Both `height` AND `minHeight` are set: `height` lets `h-full` on the
    // inner wrappers resolve to the viewport-fill value; `minHeight` ensures
    // the canvas never collapses on very short viewports.
    //
    // 2026-05-27 — When the shell renders, the canvas height needs to
    // subtract the shell's own height (~52px). The non-onboarding
    // calc(100vh - 9rem) stays unchanged for repeat visitors.
    <div className="flex h-full min-h-full w-full flex-col">
      {showShell && onboardingState.display ? (
        <OnboardingShell
          step={onboardingState.display.step}
          total={onboardingState.display.total}
          title="Build your first workspace"
        />
      ) : null}
      <main
        className="w-full flex-1"
        style={{
          height: showShell
            ? "calc(100vh - 9rem - 56px)"
            : "calc(100vh - 9rem)",
          minHeight: showShell
            ? "calc(100vh - 9rem - 56px)"
            : "calc(100vh - 9rem)",
        }}
      >
        <ClientsNewForm
          source={source ?? "default"}
          prefillUrl={prefillUrl}
          prefillBiz={prefillBiz}
          autoSubmit={autoSubmit}
          prefillAgent={prefillAgent}
          prefillVertical={prefillVertical}
        />
      </main>
    </div>
  );
}
