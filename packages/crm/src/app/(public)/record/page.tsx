// packages/crm/src/app/(public)/record/page.tsx
//
// PUBLIC, UNAUTHENTICATED "record a workflow" page — an operator
// screen-records themselves doing a job (multiple recordings capture edge
// cases); Seldon compiles each into a WorkflowTrace, merges them into a
// FlowModel, and shows a green/yellow/red coverage recap + interview chat.
// Flag-gated by isRecordToAgentOn (SF_RECORD_TO_AGENT=1); 404s when off,
// mirroring the sibling /try page's gate (try/page.tsx) and the routes
// this page consumes (api/v1/recordings/*).
//
// 2026-07-13 (Task 10, dual-path landing) — this is now an indexable
// record-mode rendering of UnifiedLanding (Task 9), not a noindex'd app
// shell: the record flow is real marketing surface, not just a logged-in
// tool. The claim contract (session/claimed/shared query params, the
// pre-claim auth() check) is unchanged.

// Landing theme tokens — imported at the route level, same as the sibling
// "/" route (see the header note in app/(public)/page.tsx) so var(--lp-*)
// resolves; unified-landing.tsx and landing-mode.tsx deliberately don't
// import CSS so they stay importable under the node:test harness.
import "@/components/landing/landing-theme.css";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { isRecordToAgentOn } from "@/lib/recordings/policy";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";
import { isDraftApprovalsOn } from "@/lib/agent-drafts/policy";
import { UnifiedLanding } from "../unified-landing";

/** SF_TIER_LADDER (2026-07-08) — same strict-"1" contract as the other
 *  dark-by-default flags. Duplicated locally (also in app/(public)/page.tsx
 *  and app/pricing/page.tsx) rather than added to lib/web-build/policy.ts,
 *  which is outside this task's touched-files list. */
function isTierLadderOn(env: { SF_TIER_LADDER?: string | undefined }): boolean {
  return env.SF_TIER_LADDER?.trim() === "1";
}

export const metadata: Metadata = {
  title: "Turn a screen recording into a working AI agent — SeldonFrame",
  description:
    "Screen-record yourself doing the job once. Seldon watches, asks about what it didn't understand, and compiles a working agent — free to try, no signup.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://www.seldonframe.com/record" },
  openGraph: {
    title: "Turn a screen recording into a working AI agent — SeldonFrame",
    description:
      "Show Seldon how you work. It builds the agent — compiled from your real workflow, testable before you switch it on.",
    type: "website",
    url: "https://www.seldonframe.com/record",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
};

export default async function RecordPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; claimed?: string; shared?: string }>;
}) {
  if (!isRecordToAgentOn({ SF_RECORD_TO_AGENT: process.env.SF_RECORD_TO_AGENT })) notFound();
  const params = await searchParams;

  // 2026-07-10 — live-test fix: an already-signed-in visitor clicking the
  // claim CTA was hopped through /signup, which 307's a signed-in user
  // straight to /dashboard (dropping the callbackUrl) instead of running
  // compile-agent. Mirrors claim-build/page.tsx's server-side auth() check
  // — must not throw for an anonymous visitor, just yield a null session.
  const session = await auth();
  const isAuthed = Boolean(session?.user?.id);

  return (
    <UnifiedLanding
      initialMode="record"
      recordEnabled={true /* the gate above already 404'd when off */}
      urlStrategy="navigate-home"
      tierLadderOn={isTierLadderOn({ SF_TIER_LADDER: process.env.SF_TIER_LADDER })}
      ungatedBuildEnabled={isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD })}
      recordFaqWithSchema
      recordProps={{
        claimedSessionId: typeof params.session === "string" ? params.session : null,
        claimed: params.claimed === "1",
        isAuthed,
        sharedFlag: params.shared === "1" ? "1" : params.shared === "miss" ? "miss" : null,
        draftApprovals: isDraftApprovalsOn({ SF_DRAFT_APPROVALS: process.env.SF_DRAFT_APPROVALS }),
      }}
    />
  );
}
