"use client";

// packages/crm/src/app/(dashboard)/proposals/[id]/proposal-editor.tsx
// Header + status pill removed in Phase C — now rendered by page.tsx.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Proposal, ProposalScopeItem } from "@/db/schema/proposals";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateProposalAction, sendProposalAction } from "@/lib/proposals/actions";

export function ProposalEditor({ proposal, publicUrl }: { proposal: Proposal; publicUrl: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [priceDollars, setPriceDollars] = useState(
    String(proposal.monthlyPriceCents / 100),
  );
  const [setupFeeDollars, setSetupFeeDollars] = useState(
    String(proposal.setupFeeCents / 100),
  );
  const [scopeItems, setScopeItems] = useState<ProposalScopeItem[]>(proposal.scopeItems);
  const [prospectFirstName, setProspectFirstName] = useState(proposal.prospectFirstName ?? "");
  const [emailSubject, setEmailSubject] = useState(proposal.emailSubject ?? "");
  const [emailBody, setEmailBody] = useState(proposal.emailBody ?? "");
  const [generatedHtml, setGeneratedHtml] = useState(proposal.generatedHtml);
  const [showHtmlEditor, setShowHtmlEditor] = useState(false);
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
      const setupFeeCents = Math.max(0, Math.round(Number(setupFeeDollars) * 100));
      const result = await updateProposalAction({
        id: proposal.id,
        monthlyPriceCents: Math.round(Number(priceDollars) * 100),
        setupFeeCents,
        scopeItems,
        prospectFirstName: prospectFirstName.trim() || null,
        emailSubject: emailSubject.trim() || null,
        emailBody: emailBody.trim() || null,
        generatedHtml,
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
  const isSent = !isDraft;

  return (
    <div className="space-y-6">
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
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">$</span>
          <Input
            type="number"
            value={setupFeeDollars}
            onChange={(e) => setSetupFeeDollars(e.target.value)}
            disabled={!isDraft}
            className="max-w-[200px]"
            min={0}
            step={50}
          />
          <span className="text-muted-foreground">setup fee (one-time)</span>
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
        <h2 className="text-xl font-semibold">Email + greeting</h2>
        <div className="space-y-3">
          <Label htmlFor="ed-first-name">
            Prospect first name{" "}
            <span className="text-muted-foreground text-xs">(used in greeting)</span>
          </Label>
          <Input
            id="ed-first-name"
            type="text"
            placeholder="John"
            value={prospectFirstName}
            onChange={(e) => setProspectFirstName(e.target.value)}
            disabled={isSent}
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="ed-subject">
            Email subject{" "}
            <span className="text-muted-foreground text-xs">(leave blank for template default)</span>
          </Label>
          <Input
            id="ed-subject"
            type="text"
            placeholder="A proposal for {prospect_name}"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            disabled={isSent}
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="ed-body">
            Email body{" "}
            <span className="text-muted-foreground text-xs">
              (message above the proposal link; blank = default)
            </span>
          </Label>
          <textarea
            id="ed-body"
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            disabled={isSent}
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Hi {first_name} — wanted to share what we put together for you. View the proposal below."
          />
        </div>
      </section>

      <section className="rounded-2xl border bg-card/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Generated proposal HTML</h2>
          <button
            type="button"
            onClick={() => setShowHtmlEditor((v) => !v)}
            disabled={isSent}
            className="text-sm text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {showHtmlEditor ? "Show preview" : "Edit HTML"}
          </button>
        </div>
        {showHtmlEditor && !isSent ? (
          <>
            <p className="text-xs text-muted-foreground">
              Direct HTML edits. Will be sanitized on save (script tags and non-https links are stripped).
            </p>
            <textarea
              value={generatedHtml}
              onChange={(e) => setGeneratedHtml(e.target.value)}
              rows={20}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </>
        ) : (
          <>
            {/* FIXME(phase-4): operator preview skips sanitization (auth-gated to the agency).
                Phase 4 sanitizes generated_html only on the PUBLIC /p/[token] route. */}
            <div
              className="prose max-w-none rounded-xl border bg-background p-6"
              dangerouslySetInnerHTML={{ __html: generatedHtml }}
            />
          </>
        )}
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
