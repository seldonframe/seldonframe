"use client";

// packages/crm/src/app/(dashboard)/proposals/[id]/proposal-editor.tsx
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Proposal, ProposalScopeItem } from "@/db/schema/proposals";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ProposalStatusPill } from "@/components/proposals/proposal-status-pill";
import { updateProposalAction, sendProposalAction } from "@/lib/proposals/actions";

export function ProposalEditor({ proposal, publicUrl }: { proposal: Proposal; publicUrl: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [priceDollars, setPriceDollars] = useState(
    String(proposal.monthlyPriceCents / 100),
  );
  const [scopeItems, setScopeItems] = useState<ProposalScopeItem[]>(proposal.scopeItems);
  const [error, setError] = useState<string | null>(null);

  function updateScopeLabel(idx: number, label: string) {
    setScopeItems((prev) => prev.map((it, i) => (i === idx ? { ...it, label } : it)));
  }

  function removeScopeItem(idx: number) {
    setScopeItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addScopeItem() {
    setScopeItems((prev) => [...prev, { label: "" }]);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateProposalAction({
        id: proposal.id,
        monthlyPriceCents: Math.round(Number(priceDollars) * 100),
        scopeItems,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await sendProposalAction({ id: proposal.id });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const isDraft = proposal.status === "draft";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {proposal.prospectName}
          </h1>
          <p className="text-sm text-muted-foreground">{proposal.prospectEmail}</p>
        </div>
        <ProposalStatusPill status={proposal.status} />
      </header>

      <section className="rounded-2xl border bg-card/40 p-6 space-y-4">
        <h2 className="text-xl font-semibold">Pricing</h2>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">$</span>
          <Input
            type="number"
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            disabled={!isDraft}
            className="max-w-[200px]"
          />
          <span className="text-muted-foreground">/ month</span>
        </div>
      </section>

      <section className="rounded-2xl border bg-card/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">What&apos;s included</h2>
          {!!isDraft && (
            <Button variant="outline" size="sm" onClick={addScopeItem}>
              + Add item
            </Button>
          )}
        </div>
        <ul className="space-y-2">
          {scopeItems.map((item, idx) => (
            <li key={idx} className="flex items-center gap-2">
              {/* Label is rendered as a visually-hidden sr-only to keep
                  the list items accessible without cluttering the UI */}
              <Label htmlFor={`scope-item-${idx}`} className="sr-only">
                Scope item {idx + 1}
              </Label>
              <Input
                id={`scope-item-${idx}`}
                value={item.label}
                onChange={(e) => updateScopeLabel(idx, e.target.value)}
                disabled={!isDraft}
              />
              {!!isDraft && (
                <Button variant="ghost" size="sm" onClick={() => removeScopeItem(idx)}>
                  ×
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card/40 p-6 space-y-4">
        <h2 className="text-xl font-semibold">Generated proposal preview</h2>
        {/* NOTE(phase-4 done): The public /p/[token] route sanitizes
            generatedHtml with sanitize-html before rendering (XSS surface).
            Here on the auth-gated /proposals/[id] page the operator views
            their own LLM-generated HTML, so sanitization is deliberately
            skipped — risk is low since only the agency that wrote it can see it. */}
        <div
          className="prose max-w-none rounded-xl border bg-background p-6"
          dangerouslySetInnerHTML={{ __html: proposal.generatedHtml }}
        />
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 sticky bottom-4">
        {isDraft && (
          <>
            <Button variant="outline" onClick={handleSave} disabled={isPending}>
              Save changes
            </Button>
            <Button onClick={handleSend} disabled={isPending}>
              {isPending ? "Sending…" : "Send proposal"}
            </Button>
          </>
        )}
        {!isDraft && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            View public page
          </a>
        )}
      </div>
    </div>
  );
}
