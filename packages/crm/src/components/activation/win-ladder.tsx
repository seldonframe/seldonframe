"use client";

// Win-ladder card (Task 7 of the win-ladder + SeldonChat plan, 2026-07-04).
// Pure presentational client component: receives the already-computed
// `LadderState` (Task 5's engine, fed by Task 6's resolver) plus the four
// per-step hrefs, and renders the 4 fixed rows. Row 3 (go_live) and row 4
// (hire_agent) render simple link CTAs for now — T9 (share row) and T10
// (agent picker) will slot richer content into those same rows later, so
// keep the seams obvious rather than building throwaway UI to replace.

import Link from "next/link";
import { Check } from "lucide-react";
import type { LadderState, LadderStepId } from "@/lib/activation/ladder";

export type WinLadderHrefs = {
  bookingUrl: string;
  integrationsUrl: string;
  domainUrl: string;
  agentsUrl: string;
};

type WinLadderProps = {
  state: LadderState;
  hrefs: WinLadderHrefs;
};

type StepCopy = {
  title: string;
  payoff: string;
};

const STEP_COPY: Record<LadderStepId, StepCopy> = {
  test_booking: {
    title: "Test your booking flow",
    payoff: "See exactly what a customer sees when they book with you.",
  },
  make_it_yours: {
    title: "Make it yours",
    payoff: "Tell SeldonChat what to change — no code, just describe it.",
  },
  go_live: {
    title: "Go live",
    payoff: "Share your site + connect your domain.",
  },
  hire_agent: {
    title: "Hire an agent",
    payoff: "Add an AI agent that works your leads for you.",
  },
};

function openSeldonChat() {
  window.dispatchEvent(new CustomEvent("seldonchat:open"));
}

export function WinLadder({ state, hrefs }: WinLadderProps) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/40 p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="text-base sm:text-lg font-semibold text-foreground">
          Get the most out of your workspace
        </h2>
        <p className="text-sm text-muted-foreground">
          {state.completedCount} of {state.steps.length} done — a few quick wins to fully activate your workspace.
        </p>
      </div>

      <ol className="space-y-2.5">
        {state.steps.map((step) => {
          const copy = STEP_COPY[step.id];
          const isCurrent = state.current === step.id;

          return (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                step.done
                  ? "border-border/50 bg-background/30"
                  : isCurrent
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/60 bg-background/20"
              }`}
            >
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                  step.done
                    ? "border-positive bg-positive/15 text-positive"
                    : isCurrent
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/70 text-muted-foreground"
                }`}
              >
                {step.done ? <Check className="size-3" /> : null}
              </span>

              <div className="min-w-0 flex-1 space-y-1">
                <p
                  className={`text-sm font-medium ${
                    step.done ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  {copy.title}
                </p>
                <p className="text-xs text-muted-foreground">{copy.payoff}</p>

                {!step.done ? (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {step.id === "test_booking" ? (
                      <>
                        <a
                          href={hrefs.bookingUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-xs font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                        >
                          Test your booking page →
                        </a>
                        <Link
                          href={hrefs.integrationsUrl}
                          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                        >
                          Connect your calendar
                        </Link>
                      </>
                    ) : null}

                    {step.id === "make_it_yours" ? (
                      <button
                        type="button"
                        onClick={openSeldonChat}
                        className="text-xs font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                      >
                        Open SeldonChat →
                      </button>
                    ) : null}

                    {step.id === "go_live" ? (
                      <Link
                        href={hrefs.domainUrl}
                        className="text-xs font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                      >
                        Share your site + connect your domain →
                      </Link>
                    ) : null}

                    {step.id === "hire_agent" ? (
                      <Link
                        href={hrefs.agentsUrl}
                        className="text-xs font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                      >
                        Browse agents →
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
