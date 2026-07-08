"use client";

import { useState, useTransition } from "react";
import { updateRetainerCardAction } from "@/lib/payments/portal-billing-actions";

export function UpdateCardButton({ orgSlug }: { orgSlug: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateRetainerCardAction(orgSlug);
      if (result.ok) {
        window.location.href = result.url;
      } else {
        setError("Couldn't open the update-card page — try again.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex h-8 items-center px-3 text-[12px] font-semibold whitespace-nowrap disabled:opacity-60"
        style={{ backgroundColor: "#111", color: "#FFFFFF", border: "1px solid #111", borderRadius: "6px" }}
      >
        {isPending ? "Opening…" : "Update card"}
      </button>
      {error ? (
        <p className="text-[11px]" style={{ color: "#B45309" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
