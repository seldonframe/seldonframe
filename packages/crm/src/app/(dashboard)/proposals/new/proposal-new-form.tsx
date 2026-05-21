"use client";
// packages/crm/src/app/(dashboard)/proposals/new/proposal-new-form.tsx
// 2026-05-21 — Phase J: 4-step wizard (Client → Pricing → Customize → Review & send).
// State lives here and is preserved across Back/Next navigation.

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandedSlider } from "./branded-slider";
import { ProposalPreviewPane } from "./proposal-preview-pane";
import { ProposalStepsHeader } from "@/components/proposals/proposal-steps-header";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

type Workspace = { id: string; name: string; slug: string };
type StepNum = 1 | 2 | 3 | 4;

const PRICE_QUICK_PICKS = [29700, 49700, 99700]; // $297 / $497 / $997
const SETUP_QUICK_PICKS = [0, 49900, 99900, 199900]; // $0 / $499 / $999 / $1,999

const STEP_ID_BY_NUM = {
  1: "step-client",
  2: "step-pricing",
  3: "step-customize",
  4: "step-review",
} as const;

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
  const [currentStep, setCurrentStep] = useState<StepNum>(1);

  // All form fields — lifted so Back navigation preserves values
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

  function handleWorkspaceChange(id: string) {
    setWorkspaceId(id);
    const ws = workspaces.find((w) => w.id === id);
    if (ws && !prospectName) setProspectName(ws.name);
  }

  // Step 1 requires workspace + name + valid email; 2 and 3 always pass
  function canAdvance(): boolean {
    if (currentStep === 1) {
      return (
        Boolean(workspaceId) &&
        prospectName.trim().length > 0 &&
        /\S+@\S+\.\S+/.test(prospectEmail.trim())
      );
    }
    return true;
  }

  function handleNext() {
    if (currentStep < 4) {
      setCurrentStep((currentStep + 1) as StepNum);
    } else {
      void handleSubmit();
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as StepNum);
    }
  }

  async function handleSubmit() {
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

  // Empty state — no workspaces provisioned yet
  if (workspaces.length === 0) {
    return (
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
    );
  }

  // Steps visited = everything before the current step
  const visitedSteps = (
    ["step-client", "step-pricing", "step-customize", "step-review"] as const
  ).slice(0, currentStep - 1);

  return (
    <div className="space-y-8">
      {/* Stepper — owned by the form so it tracks currentStep directly */}
      <ProposalStepsHeader
        brandColor={agencyContext.brandColor}
        activeStep={STEP_ID_BY_NUM[currentStep]}
        visitedSteps={visitedSteps}
      />

      {/* Page header */}
      <header className="space-y-1.5 max-w-2xl mx-auto text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Step {currentStep} of 4
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {currentStep === 1 && "Who’s this proposal for?"}
          {currentStep === 2 && "What are you charging?"}
          {currentStep === 3 && "Customize the copy"}
          {currentStep === 4 && "Review your proposal"}
        </h1>
        <p className="text-muted-foreground">
          {currentStep === 1 && "Pick the client workspace and tell us about the prospect."}
          {currentStep === 2 && "Set the monthly and (optionally) the one-time setup fee."}
          {currentStep === 3 && "Tune the email and proposal copy. Blank fields use your agency template."}
          {currentStep === 4 && "This is what your prospect will see. Save to land on the next screen where you can Send."}
        </p>
      </header>

      {/* Step content */}
      <div className="max-w-2xl mx-auto">
        {/* Step 1: Client */}
        {currentStep === 1 && (
          <section className="rounded-2xl border border-border/70 bg-card/40 p-8 space-y-5">
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
          </section>
        )}

        {/* Step 2: Pricing */}
        {currentStep === 2 && (
          <section className="rounded-2xl border border-border/70 bg-card/40 p-8 space-y-7">
            {/* Monthly */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Monthly recurring</Label>
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

            <div className="border-t border-border/40" />

            {/* Setup fee */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>
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
        )}

        {/* Step 3: Customize */}
        {currentStep === 3 && (
          <section className="rounded-2xl border border-border/70 bg-card/40 p-8 space-y-5">
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
          </section>
        )}

        {/* Step 4: Review */}
        {currentStep === 4 && (
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
        )}
      </div>

      {/* Footer nav */}
      <div className="max-w-2xl mx-auto">
        {error && (
          <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3 mb-4">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1 || submitting}
            className="h-11"
          >
            ← Back
          </Button>
          <div className="flex-1 text-center text-xs text-muted-foreground">
            {currentStep === 4 && "Saving creates a draft. You’ll Send from the next screen."}
          </div>
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance() || submitting}
            className="h-11 min-w-40"
          >
            {currentStep === 4
              ? submitting
                ? "Saving…"
                : "Save & go to review →"
              : "Next →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
