"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { runSeldonItAction, type SeldonRunState } from "@/lib/ai/seldon-actions";

type StudioListing = {
  id: string;
  name: string;
};

type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
  contactCount: number;
  soulId: string | null;
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

function formatFrameworkLabel(soulId: string | null) {
  if (!soulId) {
    return "Custom";
  }

  return soulId.charAt(0).toUpperCase() + soulId.slice(1);
}

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
    summary: `${name} gives the agency one calm control surface to decide what happens next without extra clicks.`,
    outcome: `Generated from your prompt and ready for ${starterLabel.toLowerCase()} workflows${baseLabel !== "None" ? ` using ${baseLabel} as the base` : ""}.`,
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
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>(workspaces.map((workspace) => workspace.id));

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

  const selectedWorkspaceNames = useMemo(
    () => workspaces.filter((workspace) => selectedWorkspaceIds.includes(workspace.id)).map((workspace) => workspace.name),
    [selectedWorkspaceIds, workspaces]
  );

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0] ?? null,
    [activeWorkspaceId, workspaces]
  );

  const activeWorkspaceLabel = activeWorkspace?.name ?? activeWorkspaceName;
  const selectedWorkspaceSummary = selectedWorkspaceNames.length > 0 ? selectedWorkspaceNames.join(", ") : "No client selected";
  const maxAccessibleStep: StudioStep = generatedBlock ? 4 : currentStep;

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

  function toggleWorkspace(workspaceId: string) {
    setSelectedWorkspaceIds((current) =>
      current.includes(workspaceId) ? current.filter((id) => id !== workspaceId) : [...current, workspaceId]
    );
  }

  function goToStep(step: StudioStep) {
    if (step <= maxAccessibleStep) {
      setCurrentStep(step);
    }
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

  const installToSelectedPrompt = generatedBlock
    ? `Install this generated block across multiple client workspaces.
Selected client workspaces: ${selectedWorkspaceSummary}
Mode: Builder Mode
Block: ${generatedBlock.name}
Starter: ${generatedBlock.starterLabel}
Base block: ${generatedBlock.baseLabel}
Summary: ${generatedBlock.summary}
Outcome: ${generatedBlock.outcome}
Original request: ${prompt}
Apply the block consistently and tell me which clients need manual follow-up.`
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
      <div className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <h1 className="text-page-title">Creator Studio</h1>
          <p className="text-label text-[hsl(var(--color-text-secondary))]">
            Pick a starter. Describe the outcome. Generate. Install.
          </p>
          <p className="text-sm text-muted-foreground">
            Current client: <span className="font-medium text-foreground">{activeWorkspaceName}</span>
            {activeWorkspace ? (
              <span>
                {" "}· {activeWorkspace.contactCount.toLocaleString()} clients · /{activeWorkspace.slug}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <article className="crm-card space-y-6 p-4 sm:p-6">
        <div className="grid gap-2 sm:grid-cols-4">
          {studioSteps.map((step) => {
            const isActive = step.id === currentStep;
            const isComplete = step.id < currentStep || (step.id === 3 && generatedBlock) || (step.id === 4 && installState.ok);
            const isAccessible = step.id <= maxAccessibleStep;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => goToStep(step.id)}
                disabled={!isAccessible}
                className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                  isActive
                    ? "border-primary bg-primary/10"
                    : isComplete
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/80 bg-background/35"
                } ${!isAccessible ? "cursor-not-allowed opacity-60" : "hover:border-border"}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Step {step.id}</p>
                <p className="mt-1 text-sm font-medium text-foreground">{step.label}</p>
              </button>
            );
          })}
        </div>

        {currentStep === 1 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-card-title">1. Pick a starter</h2>
              <p className="text-label text-[hsl(var(--color-text-secondary))]">Choose the closest starting point for this block.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {starterTemplates.map((template) => {
                const isSelected = template.id === selectedStarterId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateUse(template.id)}
                    className={`rounded-2xl border p-3 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-(--shadow-xs)"
                        : "border-border/80 bg-background/35 hover:border-border hover:bg-accent/35"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full border border-border/80 bg-card/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {template.category}
                      </span>
                      {isSelected ? <Check className="size-4 text-primary" /> : null}
                    </div>
                    <p className="mt-2.5 text-sm font-semibold text-foreground">{template.name}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.summary}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => setCurrentStep(2)} className="crm-button-primary h-11 px-5">
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {currentStep === 2 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-card-title">2. Describe the outcome</h2>
              <p className="text-label text-[hsl(var(--color-text-secondary))]">Say what you want the block to do in one short sentence.</p>
            </div>

            <label className="space-y-2 text-sm text-muted-foreground">
              What should this block do?
              <textarea
                value={prompt}
                onChange={(event) => {
                  resetGeneratedBlock();
                  setPrompt(event.target.value);
                }}
                className="crm-input min-h-40 w-full p-4"
                placeholder="Build a lead scoring block that scores leads and auto-books discovery calls"
              />
              <p className="text-xs text-muted-foreground">Example: “Build a block that scores leads and auto-books discovery calls.”</p>
            </label>

            <label className="space-y-2 text-sm text-muted-foreground">
              Optional base block
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
              <button type="button" onClick={() => setCurrentStep(1)} className="crm-button-secondary h-11 px-5">
                <ArrowLeft className="size-4" />
                Back
              </button>
              <button type="button" onClick={() => setCurrentStep(3)} disabled={prompt.trim().length === 0} className="crm-button-primary h-11 px-5 disabled:cursor-not-allowed disabled:opacity-60">
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {currentStep === 3 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-card-title">3. Generate</h2>
              <p className="text-label text-[hsl(var(--color-text-secondary))]">Review the setup, then generate the block preview.</p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-background/35 p-4">
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
              <button type="button" onClick={() => setCurrentStep(2)} className="crm-button-secondary h-11 px-5">
                <ArrowLeft className="size-4" />
                Back
              </button>
              <button type="button" onClick={generateBlock} className="crm-button-primary h-11 px-5">
                <Sparkles className="size-4" />
                Generate preview
              </button>
            </div>
          </div>
        ) : null}

        {currentStep === 4 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-card-title">4. Install</h2>
              <p className="text-label text-[hsl(var(--color-text-secondary))]">Install the generated block without leaving this page.</p>
            </div>

            {generatedBlock ? (
              <div className="space-y-4 rounded-2xl border border-border/80 bg-background/35 p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold text-foreground">{generatedBlock.name}</p>
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">{selectedStarter.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{generatedBlock.summary}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{generatedBlock.outcome}</p>
                </div>

                <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Install targets</p>
                  <p className="mt-1 text-xs text-muted-foreground">Choose where this block should go.</p>
                  <div className="mt-3 space-y-2">
                    {workspaces.map((workspace) => {
                      const checked = selectedWorkspaceIds.includes(workspace.id);
                      const isActiveWorkspace = workspace.id === activeWorkspaceId;
                      return (
                        <label key={workspace.id} className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/35 px-3 py-2.5 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleWorkspace(workspace.id)}
                            className="mt-1"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 truncate font-medium">
                              <span className="truncate">{workspace.name}</span>
                              {isActiveWorkspace ? (
                                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                  Active
                                </span>
                              ) : null}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {workspace.contactCount.toLocaleString()} clients · {formatFrameworkLabel(workspace.soulId)} · /{workspace.slug}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-2">
                  <form action={installAction}>
                    <input type="hidden" name="builder_mode" value="true" />
                    <input type="hidden" name="sessionId" value={installState.sessionId ?? ""} />
                    <input type="hidden" name="description" value={installToActivePrompt} />
                    <button type="submit" disabled={installPending} className="crm-button-primary h-10 w-full px-4 disabled:cursor-not-allowed disabled:opacity-60">
                      {installPending ? "Installing..." : `Install to ${activeWorkspaceLabel}`}
                    </button>
                  </form>

                  <form action={installAction}>
                    <input type="hidden" name="builder_mode" value="true" />
                    <input type="hidden" name="sessionId" value={installState.sessionId ?? ""} />
                    <input type="hidden" name="description" value={installToSelectedPrompt} />
                    <button
                      type="submit"
                      disabled={installPending || selectedWorkspaceNames.length === 0}
                      className="crm-button-secondary h-10 w-full px-4 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {installPending ? "Installing..." : "Install to selected clients"}
                    </button>
                  </form>

                  <form action={installAction}>
                    <input type="hidden" name="builder_mode" value="true" />
                    <input type="hidden" name="sessionId" value={installState.sessionId ?? ""} />
                    <input type="hidden" name="description" value={saveTemplatePrompt} />
                    <button type="submit" disabled={installPending} className="crm-button-secondary h-10 w-full px-4 disabled:cursor-not-allowed disabled:opacity-60">
                      {installPending ? "Saving..." : "Save as template"}
                    </button>
                  </form>
                </div>

                {installState.error ? (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    {installState.error}
                  </div>
                ) : null}

                {installState.message || (installState.results?.length ?? 0) > 0 ? (
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
                    <p className="text-sm font-medium text-foreground">Seldon response</p>
                    {installState.message ? <p className="mt-2 text-sm text-muted-foreground">{installState.message}</p> : null}
                    {(installState.results?.length ?? 0) > 0 ? (
                      <div className="mt-3 space-y-3">
                        {installState.results?.map((result) => (
                          <div key={`${result.blockId}-${result.openPath}`} className="rounded-xl border border-border/70 bg-background/35 p-3">
                            <p className="text-sm font-medium text-foreground">{result.blockName}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{result.description ?? result.summary}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Link href={result.openPath} className="crm-button-secondary h-9 px-3 inline-flex items-center justify-center">
                                Open
                              </Link>
                              <Link href={result.savePath} className="crm-button-secondary h-9 px-3 inline-flex items-center justify-center">
                                View in Seldon
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex justify-start">
                  <button type="button" onClick={() => setCurrentStep(3)} className="crm-button-secondary h-11 px-5">
                    <ArrowLeft className="size-4" />
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/80 bg-background/20 p-8 text-center">
                <p className="text-sm font-medium text-foreground">Generate the preview first.</p>
                <p className="mt-2 text-sm text-muted-foreground">You&apos;ll install the block here once step 3 is complete.</p>
              </div>
            )}
          </div>
        ) : null}
      </article>
    </section>
  );
}
