"use client";

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
// The claim token (`wst_...`) must never be logged or rendered — it is a
// bearer credential for the workspace.

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ClaimBuildPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ws = useMemo(() => searchParams.get("ws"), [searchParams]);
  const token = useMemo(() => searchParams.get("token"), [searchParams]);

  useEffect(() => {
    // ws is path-interpolated: strict UUID shape + encode prevents same-origin path traversal (review finding 2026-07-03)
    const WS_ID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!ws || !token || !WS_ID_RE.test(ws)) {
      router.replace("/dashboard");
      return;
    }

    let cancelled = false;

    // link-owner is idempotent server-side (conditional isNull(ownerId) update), safe on double-invoke
    void fetch(`/api/v1/workspace/${encodeURIComponent(ws)}/link-owner`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (cancelled) return;
        router.replace(res.ok ? "/dashboard?claimed=1" : "/dashboard?claim=failed");
      })
      .catch(() => {
        if (cancelled) return;
        router.replace("/dashboard?claim=failed");
      });

    return () => {
      cancelled = true;
    };
  }, [ws, token, router]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-[#14b8a6] border-t-transparent" />
        <p className="text-xl font-medium text-foreground">Attaching your workspace…</p>
      </div>
    </div>
  );
}
