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
    <main className="mx-auto max-w-5xl px-6 py-12">
      <ClientsNewForm source={source ?? "default"} />
    </main>
  );
}
