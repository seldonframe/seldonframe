"use client";

// Task 10 of the win-ladder + SeldonChat plan (Phase B, step 4). Slots into
// the win-ladder's hire_agent row (see win-ladder.tsx's future agentPicksSlot
// prop): two contextual one-click starter-agent cards (from
// suggestAgentsForIndustry) + a third static "flagship" voice-receptionist
// card that just links out (no create action — voice deploys through its own
// dedicated setup flow at /automations/voice-receptionist).

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Phone } from "lucide-react";
import { enableStarterAgentAction } from "@/lib/activation/agent-picks-actions";
import type { AgentPick } from "@/lib/activation/suggest-agents";

export type AgentPicksProps = {
  picks: AgentPick[];
  /** Which of the 2 starter skills already have an agent_template for this
   *  org (e.g. ["review-requester"]) — pre-checks + disables that card. */
  enabledIds: string[];
};

export function AgentPicks({ picks, enabledIds }: AgentPicksProps) {
  return (
    <div className="grid gap-3 pt-1 sm:grid-cols-3">
      {picks.map((pick) => (
        <StarterAgentCard
          key={pick.id}
          pick={pick}
          initiallyEnabled={enabledIds.includes(pick.id)}
        />
      ))}

      <Link
        href="/automations/voice-receptionist"
        className="rounded-xl border border-border/60 bg-background/20 p-3.5 transition-colors hover:bg-background/40"
      >
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Phone className="size-3.5 text-primary" aria-hidden />
          24/7 Phone Receptionist
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Never miss a call — answers, quotes, and books while you work
        </p>
      </Link>
    </div>
  );
}

function StarterAgentCard({
  pick,
  initiallyEnabled,
}: {
  pick: AgentPick;
  initiallyEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (enabled || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await enableStarterAgentAction(pick.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEnabled(true);
    });
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background/20 p-3.5">
      <p className="text-sm font-medium text-foreground">{pick.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{pick.payoff}</p>
      <button
        type="button"
        onClick={handleClick}
        disabled={enabled || isPending}
        className={`crm-pressable mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
          enabled
            ? "bg-positive/15 text-positive"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        } disabled:cursor-default`}
      >
        {enabled ? (
          <>
            <Check className="size-3.5" aria-hidden />
            Turned on
          </>
        ) : isPending ? (
          "Turning on…"
        ) : (
          "Turn on"
        )}
      </button>
      {error ? <p className="mt-1.5 text-[11px] text-rose-600">{error}</p> : null}
    </div>
  );
}
