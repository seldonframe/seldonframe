"use client";
// packages/crm/src/app/(dashboard)/proposals/new/proposal-new-form.tsx
// 2026-05-21 — Phase G: step progression header + branded sliders.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProposalPreviewPane } from "./proposal-preview-pane";
import { ProposalStepsHeader } from "./proposal-steps-header";
import { BrandedSlider } from "./branded-slider";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

type Workspace = { id: string; name: string; slug: string };

const PRICE_QUICK_PICKS = [29700, 49700, 99700]; // $297 / $497 / $997
const SETUP_QUICK_PICKS = [0, 49900, 99900, 199900]; // $0 / $499 / $999 / $1,999

export function ProposalNewForm({
  agencyContext,
  workspaces,
}: {
  agencyContext: {
    name: string;
    brandColor: string;
    logoUrl: string | null;
    template: AgencyProposalTemplate;
  };
  workspaces: Workspace[];
}) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string>(workspaces[0]?.id ?? "");
  const [prospectName, setProspectName] = useState("");
  const [prospectFirstName, setProspectFirstName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [monthlyCents, setMonthlyCents] = useState(49700);
  const [setupCents, setSetupCents] = useState(0);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [introText, setIntroText] = useState("");
  const [timelineText, setTimelineText] = useState("");
  const [termsText, setTermsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );

  // When operator picks a workspace, auto-fill prospect_name if blank
  function handleWorkspaceChange(id: string) {
    setWorkspaceId(id);
    const ws = workspaces.find((w) => w.id === id);
    if (ws && !prospectName) setProspectName(ws.name);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId || null,
          prospect_name: prospectName.trim(),
          prospect_email: prospectEmail.trim(),
          prospect_first_name: prospectFirstName.trim() || undefined,
          monthly_price_cents: monthlyCents,
          setup_fee_cents: setupCents,
          email_subject: emailSubject.trim() || undefined,
          email_body: emailBody.trim() || undefined,
          intro_text: introText.trim() || undefined,
          timeline_text: timelineText.trim() || undefined,
          terms_text: termsText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `error_${res.status}`);
      router.push(`/proposals/${data.proposal.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "create_failed");
      setSubmitting(false);
    }
  }

  if (workspaces.length === 0) {
    return (
      <>
        <section className="space-y-4">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight">New proposal</h1>
            <p className="text-muted-foreground">
              Pick an existing client workspace, set pricing, and send a branded proposal.
            </p>
          </header>
          <div className="rounded-2xl border border-border/70 bg-card/40 p-8 text-center space-y-3">
            <h2 className="text-xl font-semibold">Build a workspace first</h2>
            <p className="text-sm text-muted-foreground">
              You need at least one client workspace to attach to a proposal.
              Create one at{" "}
              <Link href="/clients/new" className="text-primary underline">
                /clients/new
              </Link>
              , then come back here.
            </p>
            <Link
              href="/clients/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
            >
              + Create workspace
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <ProposalStepsHeader brandColor={agencyContext.brandColor} />

        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">New proposal</h1>
          <p className="text-muted-foreground">
            Save first to review your proposal. You&apos;ll send it from the next screen.
          </p>
        </header>

        {/* Step 1: Setup — workspace picker + prospect details */}
        <section id="step-setup" className="space-y-4">
          {/* Workspace picker */}
          <div className="space-y-2">
            <Label htmlFor="workspace">Client workspace</Label>
            <select
              id="workspace"
              value={workspaceId}
              onChange={(e) => handleWorkspaceChange(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— None (external billing, no workspace iframe) —</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Want a new workspace?{" "}
              <Link href="/clients/new" className="text-primary underline">
                Build one at /clients/new
              </Link>
              .
            </p>
          </div>

          {/* Prospect */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prospect-name">Business name</Label>
              <Input
                id="prospect-name"
                type="text"
                value={prospectName}
                onChange={(e) => setProspectName(e.target.value)}
                required
                placeholder="Roofs by Shiloh"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="first-name">
                Owner first name{" "}
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="first-name"
                type="text"
                value={prospectFirstName}
                onChange={(e) => setProspectFirstName(e.target.value)}
                placeholder="John"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Prospect email</Label>
            <Input
              id="email"
              type="email"
              value={prospectEmail}
              onChange={(e) => setProspectEmail(e.target.value)}
              required
              placeholder="owner@example.com"
            />
          </div>
        </section>

        {/* Step 2: Pricing — monthly + setup sliders */}
        <section id="step-pricing" className="space-y-4">
          {/* Monthly price — slider + numeric input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="monthly">Monthly recurring</Label>
              <span className="text-xs text-muted-foreground">
                starts one month after acceptance
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <BrandedSlider
                  min={0}
                  max={200000}
                  step={500}
                  value={monthlyCents}
                  onChange={setMonthlyCents}
                  brandColor={agencyContext.brandColor}
                  ariaLabel="Monthly recurring price"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  value={Math.round(monthlyCents / 100)}
                  onChange={(e) =>
                    setMonthlyCents(Math.max(0, Math.round(Number(e.target.value) * 100)))
                  }
                  className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                />
                <span className="text-muted-foreground text-sm">/mo</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {PRICE_QUICK_PICKS.map((cents) => (
                <button
                  key={cents}
                  type="button"
                  onClick={() => setMonthlyCents(cents)}
                  className="px-2 py-0.5 rounded text-xs border border-border hover:bg-muted"
                >
                  ${(cents / 100).toLocaleString("en-US")}
                </button>
              ))}
            </div>
          </div>

          {/* Setup fee — slider + numeric input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="setup">
                Up-front fee{" "}
                <span className="text-xs text-muted-foreground">(optional, one-time)</span>
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <BrandedSlider
                  min={0}
                  max={500000}
                  step={500}
                  value={setupCents}
                  onChange={setSetupCents}
                  brandColor={agencyContext.brandColor}
                  ariaLabel="Up-front setup fee"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  value={Math.round(setupCents / 100)}
                  onChange={(e) =>
                    setSetupCents(Math.max(0, Math.round(Number(e.target.value) * 100)))
                  }
                  className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                />
                <span className="text-muted-foreground text-sm">one-time</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {SETUP_QUICK_PICKS.map((cents) => (
                <button
                  key={cents}
                  type="button"
                  onClick={() => setSetupCents(cents)}
                  className="px-2 py-0.5 rounded text-xs border border-border hover:bg-muted"
                >
                  ${(cents / 100).toLocaleString("en-US")}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Step 3: Customize — editable copy, collapsed by default */}
        <section id="step-customize">
          <details className="rounded-xl border border-border/70 p-4 space-y-3">
            <summary className="text-sm font-medium cursor-pointer select-none">
              Customize email + proposal copy
            </summary>
            <div className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label htmlFor="subj">
                  Email subject{" "}
                  <span className="text-xs text-muted-foreground">(blank = agency template)</span>
                </Label>
                <Input
                  id="subj"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder={agencyContext.template.subject}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ebody">Email body</Label>
                <textarea
                  id="ebody"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={3}
                  placeholder="Wanted to follow up on what we talked about. Built a working system for you — link below."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="intro">Proposal intro</Label>
                <textarea
                  id="intro"
                  value={introText}
                  onChange={(e) => setIntroText(e.target.value)}
                  rows={3}
                  placeholder={agencyContext.template.introCopy}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tl">Timeline</Label>
                <textarea
                  id="tl"
                  value={timelineText}
                  onChange={(e) => setTimelineText(e.target.value)}
                  rows={2}
                  placeholder={agencyContext.template.timelineCopy}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="terms">Terms / fine print</Label>
                <textarea
                  id="terms"
                  value={termsText}
                  onChange={(e) => setTermsText(e.target.value)}
                  rows={2}
                  placeholder={agencyContext.template.termsCopy}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                />
              </div>
            </div>
          </details>
        </section>

        {/* Step 4: Save & review */}
        <section id="step-save" className="space-y-3 pt-2">
          <p className="text-sm text-muted-foreground">
            Saving creates a draft — you&apos;ll review the full proposal on the next screen and decide when to send.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full" size="lg">
            {submitting ? "Saving…" : "Save & go to review →"}
          </Button>
        </section>
      </form>

      <ProposalPreviewPane
        agencyContext={agencyContext}
        formState={{
          workspaceSlug: selectedWorkspace?.slug ?? null,
          prospectName: prospectName || "[Prospect]",
          prospectFirstName,
          email: prospectEmail,
          monthlyCents,
          setupCents,
          subjectOverride: emailSubject,
          bodyOverride: emailBody,
          introOverride: introText,
          timelineOverride: timelineText,
          termsOverride: termsText,
        }}
      />
    </>
  );
}
