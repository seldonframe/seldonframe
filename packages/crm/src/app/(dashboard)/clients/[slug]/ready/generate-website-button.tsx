"use client";

// 2026-05-22 — Fallback "Generate website" button for the ready page.
//
// Shown when the R1 landing generation failed silently during workspace
// creation (non-fatal mode). Fires POST /api/v1/landing/r1/generate with
// the workspace slug, then calls router.refresh() so the ready page
// re-fetches the now-existing _r1 row and renders the URL card instead.
//
// Accessibility: spinner respects prefers-reduced-motion via the
// motion-safe Tailwind variant; on reduced-motion systems it shows a
// static "…" text instead of the rotating SVG.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

type GenerateWebsiteButtonProps = {
  workspaceSlug: string;
};

export function GenerateWebsiteButton({ workspaceSlug }: GenerateWebsiteButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    if (state === "loading") return;
    setState("loading");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/landing/r1/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_slug: workspaceSlug }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string; detail?: string };
        const msg = json.detail ?? json.error ?? `HTTP ${res.status}`;
        setErrorMessage(msg);
        setState("error");
        return;
      }

      // Refresh the server component tree so the R1 card renders.
      router.refresh();
      // Keep loading state while the page transitions — it'll unmount
      // this component once the R1 row renders.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      setErrorMessage(msg);
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        className="crm-pressable inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "loading" ? (
          <>
            {/* Spinner — hidden for prefers-reduced-motion; static text shown instead. */}
            <svg
              aria-hidden="true"
              className="size-4 motion-safe:animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="motion-reduce:inline hidden">Generating…</span>
            <span className="motion-safe:inline hidden">Generating website…</span>
          </>
        ) : (
          <>
            <Globe className="size-4" aria-hidden="true" />
            Generate website now
          </>
        )}
      </button>
      {state === "error" && errorMessage && (
        <p className="text-xs text-destructive" role="alert">
          {errorMessage}. Try again or contact support.
        </p>
      )}
    </div>
  );
}
