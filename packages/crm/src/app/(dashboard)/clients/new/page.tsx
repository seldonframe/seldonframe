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
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/clients/new");
  }

  const { source, url, biz, intent } = await searchParams;

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

  return (
    // Phase P2: full-bleed main so the IdleScene canvas can fill the entire
    // available content area (right of sidebar, below the dashboard
    // breadcrumb). The Stage scales the 720×960 canvas to fit both
    // dimensions of this container.
    //
    // Both `height` AND `minHeight` are set: `height` lets `h-full` on the
    // inner wrappers resolve to the viewport-fill value; `minHeight` ensures
    // the canvas never collapses on very short viewports.
    <main
      className="w-full"
      style={{ height: "calc(100vh - 9rem)", minHeight: "calc(100vh - 9rem)" }}
    >
      <ClientsNewForm
        source={source ?? "default"}
        prefillUrl={prefillUrl}
        prefillBiz={prefillBiz}
        autoSubmit={autoSubmit}
      />
    </main>
  );
}
