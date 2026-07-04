"use client";

// Client half of the invisible claim return — see page.tsx in this
// directory for why this page lives outside (dashboard) and why success
// routes through /switch-workspace.
//
// The claim token (`wst_...`) must never be logged or rendered — it is a
// bearer credential for the workspace.

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ClaimBuildClient() {
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
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          router.replace("/dashboard?claim=failed");
          return;
        }
        // link-owner returns { ok: true, already_linked?: true } on 200 in
        // both the fresh-claim and idempotent-relink cases — either way the
        // orgMembers owner row now exists (committed before this response
        // resolved), so the switch below is authorized. link-owner does NOT
        // switch the caller's active org itself, so without this hop the
        // buyer org stays active and the (dashboard) guard bounces again on
        // the very next request. /switch-workspace sets sf_active_org_id and
        // is outside (dashboard) — no guard to fight.
        const to = encodeURIComponent(ws);
        const next = encodeURIComponent("/dashboard?claimed=1");
        router.replace(`/switch-workspace?to=${to}&next=${next}`);
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
