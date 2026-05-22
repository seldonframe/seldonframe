// packages/crm/src/app/(dashboard)/clients/new/page.tsx
// Server component for the post-signup "paste a URL" screen.
// Spec §"New frontend page" (Cut A).
//
// Auth gate: redirect unauthenticated users to /login with a callbackUrl
// so they return here after signing in.
//
// 2026-05-19 — Phase 8: accept ?source=proposal so the proposal acceptance
// flow can link here in compact mode (suppresses agency onboarding chrome).

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ClientsNewForm } from "./clients-new-form";

export const dynamic = "force-dynamic";

export default async function ClientsNewPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/clients/new");
  }

  const { source } = await searchParams;

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
      <ClientsNewForm source={source ?? "default"} />
    </main>
  );
}
