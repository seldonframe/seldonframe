"use client";

// packages/crm/src/app/p/[token]/accept-button.tsx
// 2026-05-19 — Proposal Builder. Client component that POSTs to
// /p/[token]/accept and redirects to the Stripe Checkout URL returned.
// Phase 5 implements that route; this component only references it.

import { useState } from "react";

export function AcceptButton({ token, brandColor }: { token: string; brandColor: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/p/${token}/accept`, { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? `accept_failed_${res.status}`);
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "accept_failed");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={loading}
        style={{ backgroundColor: brandColor }}
        className="px-8 py-4 rounded-[11px] text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow disabled:opacity-50"
      >
        {loading ? "Opening Stripe…" : "Accept & start →"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
