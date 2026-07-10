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
// Same idiom as /try: a thin server gate + metadata shell, noindex'd (this
// is an app surface, not indexable content), with all interactivity in the
// client island (record-client.tsx).

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { isRecordToAgentOn } from "@/lib/recordings/policy";
import { RecordClient } from "./record-client";

export const metadata: Metadata = {
  title: "Record a workflow — SeldonFrame",
  robots: { index: false, follow: false },
};

export default async function RecordPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; claimed?: string }>;
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
    <RecordClient
      claimedSessionId={typeof params.session === "string" ? params.session : null}
      claimed={params.claimed === "1"}
      isAuthed={isAuthed}
    />
  );
}
