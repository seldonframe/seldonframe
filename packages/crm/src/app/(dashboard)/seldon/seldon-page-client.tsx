"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { disableSeldonBlockAction, runSeldonItAction, type SeldonHistoryItem, type SeldonRunResult, type SeldonRunState } from "@/lib/ai/seldon-actions";

type Services = {
  stripe: boolean;
  resend: boolean;
  twilio: boolean;
  kit: boolean;
};

const initialState: SeldonRunState = { ok: false };

function ServiceBadge({ label, connected }: { label: string; connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ${
        connected
          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.25)] text-[hsl(var(--muted-foreground))]"
      }`}
    >
      {connected ? "✓" : "✗"} {label}
    </span>
  );
}

const progressSteps = [
  "Understanding what you need...",
  "Generating your block...",
  "Creating database tables...",
  "Enabling block...",
] as const;

function ProgressList({ activeStep }: { activeStep: number }) {
  return (
    <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-4 text-sm">
      {progressSteps.map((step, idx) => (
        <p key={step} className="flex items-center justify-between">
          <span>{step}</span>
          <span>{idx < activeStep ? "✓" : idx === activeStep ? <span className="animate-pulse">⟳</span> : "○"}</span>
        </p>
      ))}
    </div>
  );
}

function ResultCard({ result, onViewBlockMd }: { result: SeldonRunResult; onViewBlockMd: (value: SeldonRunResult) => void }) {
  const summaryLines = useMemo(
    () =>
      result.summary
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [result.summary]
  );

  return (
    <article className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-4">
      <p className="text-base font-medium text-foreground">✓ Your &quot;{result.blockName}&quot; block is {result.installMode === "instant" ? "ready" : "queued for review"}.</p>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Here&apos;s what was created:</p>
      <ul className="mt-2 space-y-1 text-sm text-[hsl(var(--muted-foreground))]">
        {summaryLines.length > 0 ? summaryLines.map((line, idx) => <li key={idx}>• {line.replace(/^-\s*/, "")}</li>) : <li>• BLOCK.md generated successfully</li>}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={result.openPath} className="crm-button-primary inline-flex h-10 items-center px-4">
          Open {result.blockName}
        </Link>
        <button type="button" className="crm-button-secondary h-10 px-4" onClick={() => onViewBlockMd(result)}>
          View BLOCK.md
        </button>
        <Link href={result.marketplaceSubmitPath} className="crm-button-secondary inline-flex h-10 items-center px-4">
          Sell on Marketplace
        </Link>
      </div>
    </article>
  );
}

export function SeldonPageClient({ allowed, services, history }: { allowed: boolean; services: Services; history: SeldonHistoryItem[] }) {
  const [state, action, pending] = useActionState(runSeldonItAction, initialState);
  const [selectedResult, setSelectedResult] = useState<SeldonRunResult | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!pending) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveStep((current) => (current >= progressSteps.length - 1 ? current : current + 1));
    }, 1200);

    return () => window.clearInterval(timer);
  }, [pending]);

  return (
    <section className="animate-page-enter space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-page-title">Seldon It Into Existence</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">Describe what you need. Your business context does the rest.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ServiceBadge label="Stripe" connected={services.stripe} />
          <ServiceBadge label="Resend" connected={services.resend} />
          <ServiceBadge label="Twilio" connected={services.twilio} />
          <ServiceBadge label="Kit" connected={services.kit} />
          <Link href="/settings/integrations" className="inline-flex items-center rounded-full border border-[hsl(var(--border))] px-2.5 py-1 text-xs text-[hsl(var(--muted-foreground))]">
            Connect more
          </Link>
        </div>
      </div>

      {!allowed ? (
        <article className="glass-card rounded-2xl p-6">
          <h2 className="text-card-title">Upgrade required</h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Upgrade to Cloud Pro to Seldon custom blocks.</p>
          <Link href="/settings/billing" className="crm-button-primary mt-4 inline-flex h-10 items-center px-4">
            Upgrade Plan
          </Link>
        </article>
      ) : (
        <div className="glass-card space-y-4 rounded-2xl p-6">
          <form
            action={action}
            className="space-y-3"
            onSubmit={() => {
              setActiveStep(0);
            }}
          >
            <label htmlFor="seldon-description" className="text-label">
              Describe what you want to build
            </label>
            <textarea
              id="seldon-description"
              name="description"
              className="crm-input min-h-32 w-full p-3"
              placeholder={`Describe what you want to build...\n\nExamples:\n• Send a follow-up SMS if a lead doesn't book within 48 hours\n• Track referrals and automatically thank the referrer\n• A review request system that asks clients for Google reviews after appointments\n• A client portal where clients can see upcoming sessions and invoices`}
              required
            />
            <button type="submit" disabled={pending} className="crm-button-primary h-11 px-6">
              {pending ? "Seldoning..." : "Seldon It"}
            </button>
          </form>

          {pending ? <ProgressList activeStep={activeStep} /> : null}

          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {state.message ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{state.message}</p> : null}

          {state.results?.length ? (
            <div className="space-y-3">
              {state.results.map((result) => (
                <ResultCard key={result.blockId} result={result} onViewBlockMd={setSelectedResult} />
              ))}
            </div>
          ) : null}
        </div>
      )}

      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-card-title">Seldon History</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">No Seldoned blocks yet. Build your first one above.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {history.map((item) => (
              <article key={item.blockId} className="rounded-xl border border-[hsl(var(--border))] px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{item.blockName}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Created {new Date(item.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      item.status === "Active"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : item.status === "Review"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : "bg-[hsl(var(--muted)/0.3)] text-[hsl(var(--muted-foreground))]"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Updated {new Date(item.lastUpdatedAt).toLocaleDateString()}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={item.openPath} className="crm-button-secondary inline-flex h-9 items-center px-3">
                    Open
                  </Link>
                  {item.status === "Active" ? (
                    <form action={disableSeldonBlockAction}>
                      <input type="hidden" name="blockId" value={item.blockId} />
                      <button type="submit" className="crm-button-secondary h-9 px-3">
                        Disable
                      </button>
                    </form>
                  ) : null}
                  <Link href={item.marketplaceSubmitPath} className="crm-button-secondary inline-flex h-9 items-center px-3">
                    Publish to Marketplace
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="glass-card w-full max-w-3xl rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-card-title">{selectedResult.blockName} BLOCK.md</h3>
              <button type="button" className="crm-button-secondary h-9 px-3" onClick={() => setSelectedResult(null)}>
                Close
              </button>
            </div>
            <textarea readOnly value={selectedResult.blockMd} className="crm-input min-h-96 w-full p-3 font-mono text-xs" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
