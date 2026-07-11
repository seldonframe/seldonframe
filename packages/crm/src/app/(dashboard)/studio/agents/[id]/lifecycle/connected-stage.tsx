"use client";

// Agent lifecycle slice (T9) — Stage 03 "Connected".
//
// Required toolkits are derived server-side (page.tsx, via
// connected-toolkits.ts against the template's Composio bindings) and
// handed down as plain props — this island only renders status + drives the
// Connect redirect. No Composio key configured → a single card linking to
// /integrations (existing key flow), never a dead Connect button.

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Plug } from "lucide-react";
import { connectLifecycleToolkitAction } from "@/lib/agent-templates/lifecycle-connect-actions";

export type RequiredToolkitView = {
  slug: string;
  name: string;
  logo: string | null;
  connected: boolean;
  /** Best-effort "why" line — the step in the recording that uses this app,
   *  when known; a generic fallback otherwise. */
  why: string;
};

export function ConnectedStage({
  templateId,
  toolkits,
  composioConfigured,
}: {
  templateId: string;
  toolkits: RequiredToolkitView[];
  composioConfigured: boolean;
}) {
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startPending] = useTransition();

  if (toolkits.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
        <Check className="size-4" aria-hidden /> Nothing to connect — this agent
        doesn&apos;t need any outside app.
      </p>
    );
  }

  if (!composioConfigured) {
    return (
      <div className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/40 p-3 text-sm">
        <p className="text-[var(--lc-muted)]">
          This agent needs {toolkits.map((t) => t.name).join(", ")} connected —
          add your Composio key to enable it.
        </p>
        <Link
          href="/integrations"
          className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline"
        >
          Go to Integrations →
        </Link>
      </div>
    );
  }

  const connect = (slug: string) => {
    setError(null);
    setPendingSlug(slug);
    startPending(async () => {
      const result = await connectLifecycleToolkitAction({ templateId, toolkit: slug });
      if (!result.ok) {
        setError("Couldn't start the connect flow. Try again.");
        setPendingSlug(null);
        return;
      }
      window.location.href = result.redirectUrl;
    });
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {toolkits.map((t) => (
          <li
            key={t.slug}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/30 px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[var(--lc-ink)]">{t.name}</span>
              <span className="block text-xs text-[var(--lc-muted)]">{t.why}</span>
            </span>
            {t.connected ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="size-3.5" aria-hidden /> Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={() => connect(t.slug)}
                disabled={pendingSlug === t.slug}
                className="crm-button-secondary inline-flex h-8 items-center gap-1.5 px-3 text-xs"
              >
                <Plug className="size-3.5" aria-hidden />
                {pendingSlug === t.slug ? "Opening…" : "Connect"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
