// packages/crm/src/app/(dashboard)/clients/new/page.tsx
// Server component for the post-signup "paste a URL" screen.
// Spec §"New frontend page" (Cut A).
//
// Auth gate: redirect unauthenticated users to /login with a callbackUrl
// so they return here after signing in.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ClientsNewForm } from "./clients-new-form";

export const dynamic = "force-dynamic";

export default async function ClientsNewPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/clients/new");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <ClientsNewForm />
    </main>
  );
}
