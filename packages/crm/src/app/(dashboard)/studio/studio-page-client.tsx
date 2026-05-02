"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, LoaderCircle, Sparkles } from "lucide-react";
import { runSeldonItAction, type SeldonRunState } from "@/lib/ai/seldon-actions";

type StudioListing = {
  id: string;
  name: string;
};

type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
};

type GeneratedBlockPreview = {
  name: string;
  summary: string;
  outcome: string;
  baseLabel: string;
  starterLabel: string;
};

type StudioStep = 1 | 2 | 3 | 4;

const studioSteps: Array<{ id: StudioStep; label: string }> = [
  { id: 1, label: "Pick starter" },
  { id: 2, label: "Describe" },
  { id: 3, label: "Generate" },
  { id: 4, label: "Install" },
];

const initialInstallState: SeldonRunState = { ok: false };
const installLoadingMessages = [
  "Analyzing...",
  "Building your business profile...",
  "Building core blocks...",
  "Wiring payments...",
  "Setting up AI learning...",
  "Deploying...",
];

const starterTemplates = [
  {
    id: "lead-scoring",
    name: "Lead Scoring",
    category: "Growth",
    summary: "Score every lead, surface the best buyers, and trigger the next move.",
    prompt: "Build a lead scoring block that ranks inbound leads by fit, urgency, and likelihood to book.",
  },
  {
    id: "discovery-booking",
    name: "Discovery Booking",
    category: "Sales",
    summary: "Qualify prospects and auto-book the right discovery call.",
    prompt: "Build a block that scores leads and auto-books discovery calls when they cross a qualification threshold.",
  },
  {
    id: "re-engagement",
    name: "Re-Engagement",
    category: "Lifecycle",
    summary: "Wake up stale leads with a calm follow-up sequence.",
    prompt: "Build a re-engagement block that finds cold leads, drafts the right follow-up, and asks Seldon to send it.",
  },
  {
    id: "proposal-followup",
    name: "Proposal Follow-Up",
    category: "Revenue",
    summary: "Track proposals and nudge clients at the right moment.",
    prompt: "Build a block that watches sent proposals, scores closing likelihood, and schedules follow-up calls.",
  },
  {
    id: "onboarding",
    name: "Client Onboarding",
    category: "Operations",
    summary: "Turn signed deals into a guided onboarding flow.",
    prompt: "Build a client onboarding block that collects intake answers, creates tasks, and schedules kickoff calls.",
  },
  {
    id: "content-engine",
    name: "Content Engine",
    category: "Marketing",
    summary: "Convert voice notes and ideas into a weekly content workflow.",
    prompt: "Build a content engine block that turns ideas into publish-ready posts and routes approvals.",
  },
  {
    id: "referral-loop",
    name: "Referral Loop",
    category: "Growth",
    summary: "Ask happy clients for referrals at the perfect time.",
    prompt: "Build a referral loop block that identifies happy clients and triggers a referral ask with follow-up reminders.",
  },
  {
    id: "retention-health",
    name: "Retention Health",
    category: "Client Success",
    summary: "Detect risk early and book save calls before clients churn.",
    prompt: "Build a retention health block that scores churn risk and auto-books a save call when needed.",
  },
] as const;

function buildGeneratedBlockName(prompt: string) {
  const normalized = prompt
    .replace(/^build\s+(me\s+)?/i, "")
    .replace(/^create\s+/i, "")
    .trim()
    .split(/[.!?\n]/)[0]
    ?.trim();

  if (!normalized) {
    return "Custom Agency Block";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildGeneratedPreview(prompt: string, baseLabel: string, starterLabel: string): GeneratedBlockPreview {
  const name = buildGeneratedBlockName(prompt);
  return {
    name,
    summary: "Ready to install.",
    outcome: baseLabel !== "None" ? `${starterLabel} · Based on ${baseLabel}` : starterLabel,
    baseLabel,
    starterLabel,
  };
}

export function StudioPageClient({
  activeWorkspaceId,
  activeWorkspaceName,
  listings,
  workspaces,
}: {
  activeWorkspaceId: string;
  activeWorkspaceName: string;
  listings: StudioListing[];
  workspaces: WorkspaceOption[];
}) {
  const [installState, installAction, installPending] = useActionState(runSeldonItAction, initialInstallState);
  const [currentStep, setCurrentStep] = useState<StudioStep>(1);
  const [selectedStarterId, setSelectedStarterId] = useState<string>(starterTemplates[1]?.id ?? starterTemplates[0].id);
  const [prompt, setPrompt] = useState<string>(starterTemplates[1]?.prompt ?? starterTemplates[0].prompt);
  const [baseBlockId, setBaseBlockId] = useState<string>("");
  const [generatedBlock, setGeneratedBlock] = useState<GeneratedBlockPreview | null>(null);
  const [installTick, setInstallTick] = useState(0);

  const baseBlockLabel = useMemo(() => {
    if (!baseBlockId) {
      return "None";
    }

    return listings.find((listing) => listing.id === baseBlockId)?.name ?? "None";
  }, [baseBlockId, listings]);

  const selectedStarter = useMemo(
    () => starterTemplates.find((template) => template.id === selectedStarterId) ?? starterTemplates[0],
    [selectedStarterId]
  );

  const activeWorkspaceLabel = activeWorkspaceName;
  const installResults = installState.results ?? [];
  const primaryInstallResult = installResults[0] ?? null;
  const showInstallSuccess = installState.ok && (installResults.length > 0 || Boolean(installState.message));
  const installLoadingMessage = installLoadingMessages[installTick % installLoadingMessages.length] ?? installLoadingMessages[0];
  const installDescription =
    primaryInstallResult?.description?.trim() ||
    installState.message?.trim() ||
    (generatedBlock ? `${generatedBlock.name} is now live in your workspace.` : "Your new block is ready.");

  useEffect(() => {
    if (!installPending) {
      return;
    }

    const interval = window.setInterval(() => {
      setInstallTick((current) => current + 1);
    }, 1800);

    return () => window.clearInterval(interval);
  }, [installPending]);

  function resetGeneratedBlock() {
    if (generatedBlock) {
      setGeneratedBlock(null);
    }
  }

  function handleTemplateUse(templateId: string) {
    const template = starterTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    setSelectedStarterId(template.id);
    setPrompt(template.prompt);
    resetGeneratedBlock();
  }

  function generateBlock() {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      return;
    }

    setGeneratedBlock(buildGeneratedPreview(normalizedPrompt, baseBlockLabel, selectedStarter.name));
    setCurrentStep(4);
  }

  const installToActivePrompt = generatedBlock
    ? `Install this generated block into the active client workspace.
Workspace: ${activeWorkspaceLabel}
Mode: Builder Mode
Block: ${generatedBlock.name}
Starter: ${generatedBlock.starterLabel}
Base block: ${generatedBlock.baseLabel}
Summary: ${generatedBlock.summary}
Outcome: ${generatedBlock.outcome}
Original request: ${prompt}
Keep the experience calm, dark, and understandable in under five seconds.`
    : "";

  const saveTemplatePrompt = generatedBlock
    ? `Save this generated block as an agency template.
Block: ${generatedBlock.name}
Starter: ${generatedBlock.starterLabel}
Base block: ${generatedBlock.baseLabel}
Summary: ${generatedBlock.summary}
Outcome: ${generatedBlock.outcome}
Original request: ${prompt}
Make the template reusable across future client workspaces.`
    : "";

  return (
    <section className="animate-page-enter space-y-4">
      <div className="space-y-1.5">
          <h1 className="text-page-title">Creator Studio</h1>
          <p className="text-sm text-muted-foreground">
            Workspace: <span className="font-medium text-foreground">{activeWorkspaceName}</span>
          </p>
      </div>

      <article className="crm-card space-y-8 p-6 sm:p-8">
        <div className="grid gap-2 sm:grid-cols-4">
          {studioSteps.map((step) => {
            const isActive = step.id === currentStep;
            const isComplete = step.id < currentStep || (step.id === 3 && generatedBlock) || (step.id === 4 && installState.ok);

            return (
              <div
                key={step.id}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                  isActive
                    ? "border-primary bg-primary/10"
                    : isComplete
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/80 bg-background/35"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Step {step.id}</p>
                <p className="mt-1 text-sm font-medium text-foreground">{step.label}</p>
              </div>
            );
          })}
        </div>

        {currentStep === 1 ? (
          <div className="space-y-8">
            <h2 className="text-page-title text-2xl sm:text-3xl">Pick a starter</h2>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {starterTemplates.map((template) => {
                const isSelected = template.id === selectedStarterId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateUse(template.id)}
                    className={`rounded-3xl border px-5 py-6 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-(--shadow-xs)"
                        : "border-border/80 bg-background/35 hover:border-border hover:bg-accent/35"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full border border-border/80 bg-card/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {template.category}
                      </span>
                      {isSelected ? <Check className="size-4 text-primary" /> : null}
                    </div>
                    <p className="mt-4 text-base font-semibold text-foreground">{template.name}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => setCurrentStep(2)} className="crm-button-primary h-11 px-6">
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {currentStep === 2 ? (
          <div className="space-y-8">
            <h2 className="text-page-title text-2xl sm:text-3xl">Describe it</h2>

            <label className="space-y-2 text-sm text-muted-foreground">
              Request
              <textarea
                value={prompt}
                onChange={(event) => {
                  resetGeneratedBlock();
                  setPrompt(event.target.value);
                }}
                className="crm-input min-h-48 w-full p-5 text-base"
                placeholder="Build a lead scoring block that scores leads and auto-books discovery calls"
              />
            </label>

            <label className="max-w-md space-y-2 text-sm text-muted-foreground">
              Base block
              <select
                value={baseBlockId}
                onChange={(event) => {
                  resetGeneratedBlock();
                  setBaseBlockId(event.target.value);
                }}
                className="crm-input h-11 w-full px-3"
              >
                <option value="">None</option>
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setCurrentStep(1)} className="crm-button-secondary h-11 px-6">
                <ArrowLeft className="size-4" />
                Back
              </button>
              <button type="button" onClick={() => setCurrentStep(3)} disabled={prompt.trim().length === 0} className="crm-button-primary h-11 px-6 disabled:cursor-not-allowed disabled:opacity-60">
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {currentStep === 3 ? (
          <div className="space-y-8">
            <h2 className="text-page-title text-2xl sm:text-3xl">Generate</h2>

            <div className="rounded-3xl border border-border/80 bg-background/35 p-6">
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Starter</p>
                  <p className="mt-1 font-medium text-foreground">{selectedStarter.name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Prompt</p>
                  <p className="mt-1 text-muted-foreground">{prompt}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Base block</p>
                  <p className="mt-1 text-muted-foreground">{baseBlockLabel}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setCurrentStep(2)} className="crm-button-secondary h-11 px-6">
                <ArrowLeft className="size-4" />
                Back
              </button>
              <button type="button" onClick={generateBlock} className="crm-button-primary h-11 px-6">
                <Sparkles className="size-4" />
                Generate
              </button>
            </div>
          </div>
        ) : null}

        {currentStep === 4 ? (
          <div className="space-y-8">
            <h2 className="text-page-title text-2xl sm:text-3xl">Install</h2>

            {generatedBlock ? (
              <div className="space-y-6 rounded-3xl border border-border/80 bg-background/35 p-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold text-foreground">{generatedBlock.name}</p>
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">{selectedStarter.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{generatedBlock.summary}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{generatedBlock.outcome}</p>
                </div>

                <div className="rounded-3xl border border-border/70 bg-card/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Install targets</p>
                  <p className="mt-2 text-sm text-muted-foreground">Install to the active workspace first, or save it as a reusable template.</p>
                  <div className="mt-3 space-y-2">
                    {workspaces.map((workspace) => {
                      const isActiveWorkspace = workspace.id === activeWorkspaceId;
                      return (
                        <div key={workspace.id} className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/35 px-3 py-2.5 text-sm text-foreground">
                          <span className={`mt-1 inline-flex size-2.5 shrink-0 rounded-full ${isActiveWorkspace ? "bg-primary" : "bg-border"}`} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 truncate font-medium">
                              <span className="truncate">{workspace.name}</span>
                              {isActiveWorkspace ? (
                                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                  Active
                                </span>
                              ) : null}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">/{workspace.slug}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-2">
                  <form action={installAction}>
                    <input type="hidden" name="builder_mode" value="true" />
                    <input type="hidden" name="sessionId" value={installState.sessionId ?? ""} />
                    <input type="hidden" name="description" value={installToActivePrompt} />
                    <button
                      type="submit"
                      disabled={installPending}
                      onClick={() => setInstallTick(0)}
                      className="crm-button-primary h-10 w-full px-4 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {installPending ? "Installing..." : `Install to ${activeWorkspaceLabel}`}
                    </button>
                  </form>

                  <form action={installAction}>
                    <input type="hidden" name="builder_mode" value="true" />
                    <input type="hidden" name="sessionId" value={installState.sessionId ?? ""} />
                    <input type="hidden" name="description" value={saveTemplatePrompt} />
                    <button
                      type="submit"
                      disabled={installPending}
                      onClick={() => setInstallTick(0)}
                      className="crm-button-secondary h-10 w-full px-4 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {installPending ? "Saving..." : "Save as template"}
                    </button>
                  </form>
                </div>

                {installPending ? (
                  <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6">
                    <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                      <div className="inline-flex size-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                        <LoaderCircle className="size-5 animate-spin" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-semibold text-foreground">Installing your block</p>
                        <p className="text-sm text-muted-foreground">{installLoadingMessage}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {installState.error ? (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    {installState.error}
                  </div>
                ) : null}

                {showInstallSuccess ? (
                  <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-6 shadow-(--shadow-card)">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="inline-flex size-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                          <Check className="size-5" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-xl font-semibold text-foreground">Block installed successfully</h3>
                          <p className="text-sm text-muted-foreground">{installDescription}</p>
                        </div>
                      </div>
                      {installResults.length > 1 ? (
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {installResults.length} installs ready
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5 rounded-2xl border border-border/70 bg-background/50 p-4">
                      <p className="text-sm font-medium text-foreground">{primaryInstallResult?.blockName ?? generatedBlock?.name ?? "New block"}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        This block was automatically personalized to your current OS (branding, CRM, Soul settings)
                      </p>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                      <Link
                        href={primaryInstallResult?.openPath ?? "/dashboard"}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-medium text-white transition hover:bg-emerald-400"
                      >
                        Open the new block now
                        <ArrowUpRight className="size-4" />
                      </Link>
                      <Link href="/seldon" className="crm-button-secondary h-11 px-5 inline-flex items-center justify-center">
                        Customize further with Seldon It
                      </Link>
                    </div>

                    <p className="mt-4 text-xs text-muted-foreground">You can always ask Seldon It to modify it later</p>
                  </div>
                ) : null}

                <div className="flex justify-start">
                  <button type="button" onClick={() => setCurrentStep(3)} className="crm-button-secondary h-11 px-6">
                    <ArrowLeft className="size-4" />
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/80 bg-background/20 p-10 text-center">
                <p className="text-sm font-medium text-foreground">Generate first.</p>
              </div>
            )}
          </div>
        ) : null}
      </article>
    </section>
  );
}
