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
        <section className="rounded-2xl border border-border/70 bg-card/40 p-12 text-center space-y-4 max-w-xl mx-auto">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Get started</p>
            <h2 className="text-2xl font-semibold tracking-tight">Build a workspace first</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            You need at least one client workspace to attach to a proposal. Create one at /clients/new, then come back here.
          </p>
          <Link
            href="/clients/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            + Create workspace
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Page header */}
        <header className="space-y-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">New proposal</h1>
          <p className="text-muted-foreground">
            Save first to review your proposal. You&apos;ll send it from the next screen.
          </p>
        </header>

        {/* Section 1: Who's this for */}
        <section id="step-setup" className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Who&apos;s this for</p>
            <h2 className="text-lg font-semibold tracking-tight">Prospect &amp; workspace</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace">Client workspace</Label>
              <select
                id="workspace"
                value={workspaceId}
                onChange={(e) => handleWorkspaceChange(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— None (external billing, no workspace iframe) —</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Want a new workspace?{" "}
                <Link href="/clients/new" className="underline">
                  Build one at /clients/new
                </Link>
                .
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prospect-name">Business name</Label>
                <Input
                  id="prospect-name"
                  type="text"
                  value={prospectName}
                  className="h-11"
                  onChange={(e) => setProspectName(e.target.value)}
                  required
                  placeholder="Roofs by Shiloh"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="first-name">
                  Owner first name{" "}
                  <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="first-name"
                  type="text"
                  value={prospectFirstName}
                  className="h-11"
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
                className="h-11"
                onChange={(e) => setProspectEmail(e.target.value)}
                required
                placeholder="owner@example.com"
              />
            </div>
          </div>
        </section>

        {/* Section 2: Pricing */}
        <section id="step-pricing" className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Pricing</p>
            <h2 className="text-lg font-semibold tracking-tight">What you&apos;re charging</h2>
          </div>

          {/* Monthly slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="monthly">Monthly recurring</Label>
              <span className="text-xs text-muted-foreground">starts one month after acceptance</span>
            </div>
            <div className="flex items-center gap-4">
              <BrandedSlider
                min={0}
                max={200000}
                step={500}
                value={monthlyCents}
                onChange={setMonthlyCents}
                brandColor={agencyContext.brandColor}
                ariaLabel="Monthly recurring price"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  value={Math.round(monthlyCents / 100)}
                  onChange={(e) =>
                    setMonthlyCents(Math.max(0, Math.round(Number(e.target.value) * 100)))
                  }
                  className="h-11 w-24 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-muted-foreground text-sm">/mo</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRICE_QUICK_PICKS.map((cents) => (
                <button
                  key={cents}
                  type="button"
                  onClick={() => setMonthlyCents(cents)}
                  className="px-3 py-1 rounded-md text-xs border border-border bg-card hover:bg-muted hover:border-foreground/20 transition-colors"
                >
                  ${(cents / 100).toLocaleString("en-US")}
                </button>
              ))}
            </div>
          </div>

          {/* Setup fee slider */}
          <div className="space-y-3 pt-4 border-t border-border/40">
            <div className="flex items-center justify-between">
              <Label htmlFor="setup">
                Up-front fee{" "}
                <span className="text-xs text-muted-foreground font-normal">(optional, one-time)</span>
              </Label>
            </div>
            <div className="flex items-center gap-4">
              <BrandedSlider
                min={0}
                max={500000}
                step={500}
                value={setupCents}
                onChange={setSetupCents}
                brandColor={agencyContext.brandColor}
                ariaLabel="Up-front setup fee"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  value={Math.round(setupCents / 100)}
                  onChange={(e) =>
                    setSetupCents(Math.max(0, Math.round(Number(e.target.value) * 100)))
                  }
                  className="h-11 w-24 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-muted-foreground text-sm">one-time</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SETUP_QUICK_PICKS.map((cents) => (
                <button
                  key={cents}
                  type="button"
                  onClick={() => setSetupCents(cents)}
                  className="px-3 py-1 rounded-md text-xs border border-border bg-card hover:bg-muted hover:border-foreground/20 transition-colors"
                >
                  ${(cents / 100).toLocaleString("en-US")}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: Customize (was collapsible, now inline) */}
        <section id="step-customize" className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Customize</p>
            <h2 className="text-lg font-semibold tracking-tight">Email &amp; proposal copy</h2>
            <p className="text-sm text-muted-foreground">Leave blank to use your agency template defaults.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subj">Email subject</Label>
              <Input
                id="subj"
                value={emailSubject}
                className="h-11"
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
                rows={4}
                placeholder="Wanted to follow up on what we talked about. Built a working system for you — link below."
                className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intro">Proposal intro</Label>
              <textarea
                id="intro"
                value={introText}
                onChange={(e) => setIntroText(e.target.value)}
                rows={4}
                placeholder={agencyContext.template.introCopy}
                className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tl">Timeline</Label>
                <textarea
                  id="tl"
                  value={timelineText}
                  onChange={(e) => setTimelineText(e.target.value)}
                  rows={3}
                  placeholder={agencyContext.template.timelineCopy}
                  className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="terms">Terms / fine print</Label>
                <textarea
                  id="terms"
                  value={termsText}
                  onChange={(e) => setTermsText(e.target.value)}
                  rows={3}
                  placeholder={agencyContext.template.termsCopy}
                  className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Save section */}
        <section id="step-save-block" className="space-y-4">
          <div className="rounded-xl border border-border/40 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            Saving creates a draft. You&apos;ll review the full proposal on the next screen and decide when to send.
          </div>
          {error && (
            <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="w-full h-12 text-base" size="lg">
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
