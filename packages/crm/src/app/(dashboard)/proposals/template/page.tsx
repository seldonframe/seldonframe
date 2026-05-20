// packages/crm/src/app/(dashboard)/proposals/template/page.tsx
// 2026-05-19 — Proposal Builder. Per-agency template editor server component.
// Spec: §"Phase 7 — per-agency template editor".

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { AgencyProfile } from "@/db/schema/agency-profile";
import { DEFAULT_PROPOSAL_TEMPLATE } from "@/lib/proposals/generate-html";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";

export default async function ProposalTemplatePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/proposals/template");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");

  const profile = (user.agencyProfile as AgencyProfile | null) ?? {};
  const template = profile.proposalTemplate ?? DEFAULT_PROPOSAL_TEMPLATE;
  const agencyName = profile.name ?? user.name ?? "Your Agency";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Proposal template</h1>
        <p className="text-muted-foreground">
          Customize the copy sent with every proposal. Variables swap in when the proposal is
          sent.
        </p>
      </header>
      <TemplateEditor template={template} agencyName={agencyName} />
    </main>
  );
}
