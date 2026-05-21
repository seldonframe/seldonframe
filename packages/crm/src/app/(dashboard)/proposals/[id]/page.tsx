// packages/crm/src/app/(dashboard)/proposals/[id]/page.tsx
// 2026-05-20 — Phase C: mini-CRM layout (header, quick actions,
// two-column grid: editor left, activity+notes sidebar right).

import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { proposals, users } from "@/db/schema";
import { ActivityTimeline } from "@/components/proposals/activity-timeline";
import { InternalNotes } from "@/components/proposals/internal-notes";
import { QuickActions } from "@/components/proposals/quick-actions";
import { ProposalStatusPill } from "@/components/proposals/proposal-status-pill";
import {
  ProposalStepsHeader,
  type ProposalStepId,
} from "@/components/proposals/proposal-steps-header";
import { ProposalEditor } from "./proposal-editor";

export const dynamic = "force-dynamic";

export default async function ProposalEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user] = await db
    .select({ orgId: users.orgId, agencyProfile: users.agencyProfile })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");

  const { id } = await params;

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.agencyOrgId, user.orgId)))
    .limit(1);

  if (!proposal) notFound();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const publicUrl = `${baseUrl}/p/${proposal.signedToken}`;

  // 2-step lifecycle: step 1 (create) is always visited once we're on /[id];
  // step 2 (review & send) stays as the active step throughout the /[id]
  // lifecycle, but flips to visited (✓) once the proposal moves out of
  // draft. Post-send status (sent/viewed/accepted/declined/expired) is
  // communicated by the status pill in the header — not by additional steps.
  const activeStep: ProposalStepId = "step-review";
  const visitedSteps: ProposalStepId[] =
    proposal.status === "draft"
      ? ["step-create"]
      : ["step-create", "step-review"];

  const brandColor =
    (user.agencyProfile as { brand_color?: string } | null)?.brand_color ??
    "#0ea5e9";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <ProposalStepsHeader
        brandColor={brandColor}
        activeStep={activeStep}
        visitedSteps={visitedSteps}
      />

      {/* Header with status + key timestamps */}
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {proposal.prospectName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {proposal.prospectEmail}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ProposalStatusPill status={proposal.status} />
          {proposal.acceptedAt && (
            <p className="text-xs text-muted-foreground">
              Accepted{" "}
              {new Date(proposal.acceptedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
          {proposal.declinedAt && (
            <p className="text-xs text-muted-foreground">
              Declined{" "}
              {new Date(proposal.declinedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
          )}
        </div>
      </header>

      {/* Quick actions */}
      <QuickActions proposal={proposal} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main column: editor (pricing, scope, HTML preview, send/save) */}
        <div className="space-y-6">
          <ProposalEditor proposal={proposal} publicUrl={publicUrl} />
        </div>

        {/* Sidebar: activity timeline + internal notes */}
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-2xl border bg-card/40 p-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide">
              Activity
            </h2>
            <ActivityTimeline proposalId={proposal.id} />
          </section>
          <section className="rounded-2xl border bg-card/40 p-5">
            <InternalNotes
              proposalId={proposal.id}
              notes={proposal.internalNotes ?? []}
            />
          </section>
        </aside>
      </div>
    </main>
  );
}
