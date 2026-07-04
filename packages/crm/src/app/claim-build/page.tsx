// 2026-07-03 — web-activation invisible claim return
// (docs/superpowers/specs/2026-07-03-web-activation-design.md).
//
// The /try reveal (Task 5) sends anonymous builders to
// /signup?callbackUrl=<encoded /claim-build?ws=<orgId>&token=<wst_...>>.
// After auth, signup redirects to that callbackUrl. This page finishes the
// loop invisibly: it POSTs the workspace bearer token to link-owner so the
// now-authenticated session becomes the workspace's owner, then bounces to
// /dashboard. There is no UI to build here beyond a brief spinner — the
// claim itself is the whole point, modeled directly on the existing
// /claim page's fetch pattern ((dashboard)/claim/page.tsx:37-41).
//
// 2026-07-04 — MOVED out of (dashboard) (prod incident: a marketplace
// BUYER-only account hit this page and was 307'd to /agent/<deploymentId>
// before the claim ever ran). The (dashboard) layout unconditionally calls
// enforceBuyerAgencyShellGuard() (lib/marketplace/buyer/buyer-surface-guard-server.ts:106),
// which is path-independent by design: ANY (dashboard) route reached by a
// buyer-only org gets redirect()'d away. That guard exists to keep buyers
// off the agency shell, but it also means the claim page could never run
// for a buyer account. This page now lives at the top level, outside that
// route group, so the claim always executes regardless of the visiting
// account's shape.
//
// This file is a server component so it can check auth() before rendering
// anything client-side: a cold / logged-out visit to a claim link (e.g. the
// user's session expired between /try and clicking the email link) now
// self-heals by bouncing through /signup with the claim URL preserved as
// callbackUrl, instead of the client page silently failing to attach
// Authorization on an anonymous session.
//
// The claim token (`wst_...`) must never be logged or rendered — it is a
// bearer credential for the workspace.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ClaimBuildClient } from "./claim-build-client";

export default async function ClaimBuildPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string; token?: string }>;
}) {
  const params = await searchParams;
  const ws = params.ws;
  const token = params.token;

  const session = await auth();
  if (!session?.user?.id) {
    if (ws && token) {
      const claimUrl = `/claim-build?ws=${ws}&token=${token}`;
      redirect(`/signup?callbackUrl=${encodeURIComponent(claimUrl)}`);
    }
    redirect("/dashboard");
  }

  return <ClaimBuildClient />;
}
