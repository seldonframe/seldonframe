"use client";

// Agent lifecycle slice (T11) — Stage 05 "Sell".
//
// Order: For myself → Marketplace → To a client. The Marketplace card embeds
// the EXISTING ListOnMarketplace panel (moved here, not forked) behind a
// gate checklist (evals ✓/✗ · supervised run ✓/✗, from lifecycleGate — the
// same check the server-side publish gate enforces, so the UI can never
// promise a publish the server will reject).

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Rocket, Store, Users, X } from "lucide-react";
import { deployToSelfAction } from "@/lib/agent-templates/deploy-to-self-actions";
import { ListOnMarketplace } from "../list-on-marketplace";
import type { SellerListingView, SellerConnectStatus } from "@/lib/marketplace/seller-actions";

export function SellStage({
  templateId,
  templateName,
  agentType,
  builderName,
  initialListing,
  initialConnect,
  evalPass,
  supervisedRunSucceeded,
  supervisedRunExempt,
}: {
  templateId: string;
  templateName: string;
  agentType: string | null;
  builderName: string;
  initialListing: SellerListingView | null;
  initialConnect: SellerConnectStatus;
  evalPass: boolean;
  supervisedRunSucceeded: boolean;
  /** F-D: true for a tool-free (pure-chat) template — the supervised-run
   *  requirement is exempt, so it counts as satisfied for the checklist too
   *  (matches the server-side publish gate exactly). */
  supervisedRunExempt: boolean;
}) {
  const [pending, startPending] = useTransition();
  const [selfResult, setSelfResult] = useState<
    { ok: true; deploymentId: string; active: boolean; triggerSentence: string } | { ok: false } | null
  >(null);

  const deployToSelf = () => {
    setSelfResult(null);
    startPending(async () => {
      const result = await deployToSelfAction(templateId);
      setSelfResult(result.ok ? result : { ok: false });
    });
  };

  const supervisedRunSatisfied = supervisedRunSucceeded || supervisedRunExempt;
  const marketplaceReady = evalPass && supervisedRunSatisfied;

  return (
    <div className="space-y-4">
      {/* ── For myself ── */}
      <div className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/30 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--lc-ink)]">For myself</p>
            <p className="text-xs text-[var(--lc-muted)]">
              Run this agent in your own workspace — one click, no client to set up.
            </p>
          </div>
          <button
            type="button"
            onClick={deployToSelf}
            disabled={pending}
            className="crm-button-secondary inline-flex h-9 shrink-0 items-center gap-1.5 px-4 text-sm"
          >
            <Rocket className="size-4" aria-hidden />
            {pending ? "Deploying…" : "Deploy for myself"}
          </button>
        </div>
        {selfResult?.ok ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="size-3.5" aria-hidden />
            {selfResult.active
              ? `Live — it ${selfResult.triggerSentence}`
              : "Saved as a draft — it needs a phone number before it can go live."}
          </p>
        ) : null}
        {selfResult && !selfResult.ok ? (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">Couldn&apos;t deploy. Try again.</p>
        ) : null}
      </div>

      {/* ── Marketplace ── */}
      <div className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/30 p-3.5">
        <div className="flex items-start gap-2">
          <Store className="mt-0.5 size-4 shrink-0 text-[var(--lc-muted)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--lc-ink)]">Marketplace</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              <li className={evalPass ? "text-emerald-700 dark:text-emerald-400" : "text-[var(--lc-muted)]"}>
                {evalPass ? <Check className="mr-1 inline size-3" /> : <X className="mr-1 inline size-3" />}
                Evals passing
              </li>
              <li
                className={
                  supervisedRunSatisfied ? "text-emerald-700 dark:text-emerald-400" : "text-[var(--lc-muted)]"
                }
              >
                {supervisedRunSatisfied ? (
                  <Check className="mr-1 inline size-3" />
                ) : (
                  <X className="mr-1 inline size-3" />
                )}
                {supervisedRunExempt ? "No connected apps to supervise" : "Supervised run completed"}
              </li>
            </ul>
            {marketplaceReady ? (
              <div className="mt-3">
                <ListOnMarketplace
                  templateId={templateId}
                  templateName={templateName}
                  agentType={agentType}
                  builderName={builderName}
                  initialListing={initialListing}
                  initialConnect={initialConnect}
                />
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--lc-muted)]">
                Finish Verified and Run above to unlock publishing.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── To a client ── */}
      <div className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/30 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--lc-ink)]">To a client</p>
            <p className="text-xs text-[var(--lc-muted)]">
              Set up a no-login client for this agent, priced and branded for them.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              href={`/studio/agents/${templateId}/deploy`}
              className="crm-button-secondary inline-flex h-9 items-center gap-1.5 px-4 text-sm"
            >
              <Rocket className="size-4" aria-hidden />
              Deploy
            </Link>
            <Link
              href={`/studio/agents/${templateId}/deploy-to-clients`}
              className="crm-button-secondary inline-flex h-9 items-center gap-1.5 px-4 text-sm"
            >
              <Users className="size-4" aria-hidden />
              Deploy to clients
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
