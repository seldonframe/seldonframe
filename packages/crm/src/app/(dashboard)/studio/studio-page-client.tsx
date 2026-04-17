"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";

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
  const router = useRouter();
  const viewMode = "builder" as const;
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

  function openSeldonWithPrompt(promptText: string) {
    router.push(`/seldon?prompt=${encodeURIComponent(promptText)}`);
  }

  function handleTemplateUse(templateId: string) {
    const template = starterTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    setSelectedStarterId(template.id);
    setPrompt(template.prompt);
  }

  function toggleWorkspace(workspaceId: string) {
    setSelectedWorkspaceIds((current) =>
      current.includes(workspaceId) ? current.filter((id) => id !== workspaceId) : [...current, workspaceId]
    );
  }

  function generateBlock() {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      return;
    }

    setGeneratedBlock(buildGeneratedPreview(normalizedPrompt, baseBlockLabel, selectedStarter.name));
  }

  function installToThisClient() {
    if (!generatedBlock) {
      return;
    }

    openSeldonWithPrompt(
      `Install this generated block into the active client workspace.
Workspace: ${activeWorkspaceName}
View mode: ${viewMode === "builder" ? "Builder Mode" : "End-Client View"}
Block: ${generatedBlock.name}
Summary: ${generatedBlock.summary}
Outcome: ${generatedBlock.outcome}
Original request: ${prompt}
Keep the experience calm, dark, and understandable in under five seconds.`
    );
  }

  function installToSelectedClients() {
    if (!generatedBlock || selectedWorkspaceNames.length === 0) {
      return;
    }

    openSeldonWithPrompt(
      `Install this generated block across multiple client workspaces.
Selected client workspaces: ${selectedWorkspaceNames.join(", ")}
View mode: ${viewMode === "builder" ? "Builder Mode" : "End-Client View"}
Block: ${generatedBlock.name}
Summary: ${generatedBlock.summary}
Outcome: ${generatedBlock.outcome}
Original request: ${prompt}
Apply the block consistently and tell me which clients need manual follow-up.`
    );
  }

  function saveAsTemplate() {
    if (!generatedBlock) {
      return;
    }

    openSeldonWithPrompt(
      `Save this generated block as an agency template.
Block: ${generatedBlock.name}
Starter: ${generatedBlock.starterLabel}
Base block: ${generatedBlock.baseLabel}
Summary: ${generatedBlock.summary}
Outcome: ${generatedBlock.outcome}
Original request: ${prompt}
Make the template reusable across future client workspaces.`
    );
  }

  return (
    <section className="animate-page-enter space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
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
        <div className="flex flex-wrap gap-2">
          <Link
            href="/seldon?prompt=Build%20a%20new%20agency%20block%20for%20me.%20Start%20with%20the%20highest-impact%20workflow%20for%20my%20clients."
            className="crm-button-primary h-10 px-4"
          >
            <Sparkles className="size-4" />
            Ask Seldon to Build
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <article className="crm-card space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="text-card-title">1. Pick a starter</h2>
            <p className="text-label text-[hsl(var(--color-text-secondary))]">Choose the closest block and keep the request short.</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
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

          <div className="space-y-4">
            <label className="space-y-2 text-sm text-muted-foreground">
              2. Describe the outcome
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="crm-input min-h-36 w-full p-4"
                placeholder="Build a lead scoring block that scores leads and auto-books discovery calls"
              />
              <p className="text-xs text-muted-foreground">Example: “Build a block that scores leads and auto-books discovery calls.”</p>
            </label>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="space-y-2 text-sm text-muted-foreground">
                Use existing block as base
                <select value={baseBlockId} onChange={(event) => setBaseBlockId(event.target.value)} className="crm-input h-11 w-full px-3">
                  <option value="">None</option>
                  {listings.map((listing) => (
                    <option key={listing.id} value={listing.id}>
                      {listing.name}
                    </option>
                  ))}
                </select>
              </label>

              <button type="button" onClick={generateBlock} className="crm-button-primary h-11 px-5 md:min-w-44">
                3. Generate
              </button>
            </div>
          </div>
        </article>

        <article className="crm-card space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="text-card-title">4. Install</h2>
            <p className="text-label text-[hsl(var(--color-text-secondary))]">
              Preview once, then install to one client or many.
            </p>
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
                <p className="mt-1 text-xs text-muted-foreground">Choose exactly where this block should go.</p>
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
                <button type="button" onClick={installToThisClient} className="crm-button-primary h-10 w-full px-4">
                  Install to this client
                </button>
                <button
                  type="button"
                  onClick={installToSelectedClients}
                  disabled={selectedWorkspaceNames.length === 0}
                  className="crm-button-secondary h-10 w-full px-4 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Install to all my clients
                </button>
                <button type="button" onClick={saveAsTemplate} className="crm-button-secondary h-10 w-full px-4">
                  Save as template
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/80 bg-background/20 p-8 text-center">
              <p className="text-sm font-medium text-foreground">Generate the block to unlock install.</p>
              <p className="mt-2 text-sm text-muted-foreground">This panel will show the preview and install targets.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
