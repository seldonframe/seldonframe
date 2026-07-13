"use client";
// packages/crm/src/app/(dashboard)/proposals/new/proposal-preview-pane.tsx
// 2026-05-21 — Phase E. Reactive preview reflecting workspace picker,
// sliders, and all per-proposal copy overrides. No LLM, no URL parsing.

import { useMemo } from "react";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

export function ProposalPreviewPane({
  agencyContext,
  formState,
}: {
  agencyContext: {
    name: string;
    brandColor: string;
    logoUrl: string | null;
    template: AgencyProposalTemplate;
  };
  formState: {
    workspaceSlug: string | null;
    prospectName: string;
    prospectFirstName: string;
    email: string;
    monthlyCents: number;
    setupCents: number;
    subjectOverride: string;
    bodyOverride: string;
    introOverride: string;
    timelineOverride: string;
    termsOverride: string;
  };
}) {
  const prospectName = formState.prospectName || "[Prospect Name]";
  const greetingName = formState.prospectFirstName.trim() || prospectName;

  const vars = useMemo(
    () => ({
      prospectName,
      prospectFirstName: greetingName,
      agencyName: agencyContext.name,
      price: formatPriceUSD(formState.monthlyCents),
    }),
    [prospectName, greetingName, agencyContext.name, formState.monthlyCents],
  );

  // Each field uses override if non-empty, else template substituted
  const subject =
    formState.subjectOverride.trim() ||
    substitute(agencyContext.template.subject, vars);
  const intro =
    formState.introOverride.trim() ||
    substitute(agencyContext.template.introCopy, vars);
  const timeline =
    formState.timelineOverride.trim() ||
    substitute(agencyContext.template.timelineCopy, vars);
  const terms =
    formState.termsOverride.trim() ||
    substitute(agencyContext.template.termsCopy, vars);

  return (
    <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
      <h2 className="text-lg font-semibold tracking-tight">Live preview</h2>
      <p className="text-xs text-muted-foreground -mt-2">
        Updates as you type. Final HTML is composed on Save.
      </p>

      {/* Email preview */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40 bg-muted/20">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Email</p>
        </div>
        <div className="p-6 space-y-3">
          <div
            className="border-l-2 pl-3 space-y-2 text-sm"
            style={{ borderColor: agencyContext.brandColor }}
          >
            <p className="text-xs text-muted-foreground">
              From: <span className="text-foreground">{agencyContext.name}</span>
              <br />
              To:{" "}
              <span className="text-foreground">
                {formState.email || "[prospect@example.com]"}
              </span>
            </p>
            <p className="font-semibold">
              {subject}
              {formState.setupCents > 0 && (
                <span
                  className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: agencyContext.brandColor }}
                >
                  Setup fee active
                </span>
              )}
            </p>
            <p className="text-muted-foreground">Hi {greetingName},</p>
            <p className="text-muted-foreground">
              {formState.bodyOverride.trim() ||
                `${agencyContext.name} put together a proposal for you. View it here:`}
            </p>
            <button
              type="button"
              disabled
              style={{ backgroundColor: agencyContext.brandColor }}
              className="px-4 py-1.5 rounded text-white text-xs font-medium opacity-70 cursor-not-allowed"
            >
              View proposal →
            </button>
          </div>
        </div>
      </div>

      {/* Proposal page preview */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40 bg-muted/20">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Proposal page</p>
        </div>
        <div className="p-6 space-y-4">
          {agencyContext.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agencyContext.logoUrl} alt={agencyContext.name} className="h-8" />
          )}
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: agencyContext.brandColor }}
          >
            {prospectName}
          </h1>
          <p className="text-sm text-muted-foreground italic">{intro}</p>

          <div className="space-y-2 text-sm">
            <p className="font-semibold">Timeline</p>
            <p className="text-muted-foreground">{timeline}</p>
          </div>

          {/* Workspace booking page hint or dashed placeholder */}
          {formState.workspaceSlug ? (
            <div className="aspect-video rounded-lg border-2 border-dashed border-primary/30 flex flex-col items-center justify-center text-xs text-muted-foreground gap-1">
              <span className="font-medium text-foreground">Workspace attached</span>
              <span>{formState.workspaceSlug}.seldonframe.com/book</span>
            </div>
          ) : (
            <div className="aspect-video rounded-lg border-2 border-dashed border-border/70 flex items-center justify-center text-xs text-muted-foreground">
              No workspace attached (external billing)
            </div>
          )}

          {/* Price block */}
          <div
            className="rounded-xl border-2 p-4 text-center space-y-2 transition-opacity duration-150"
            style={{ borderColor: agencyContext.brandColor }}
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Investment
            </p>
            {formState.setupCents > 0 && (
              <p
                className="text-xl font-semibold"
                style={{ color: agencyContext.brandColor }}
              >
                ${(formState.setupCents / 100).toLocaleString("en-US")}
                <span className="text-xs text-muted-foreground"> one-time setup</span>
              </p>
            )}
            <p
              className="text-2xl font-semibold"
              style={{ color: agencyContext.brandColor }}
            >
              ${(formState.monthlyCents / 100).toLocaleString("en-US")}
              <span className="text-xs text-muted-foreground"> / month</span>
            </p>
            {formState.setupCents > 0 && (
              <p className="text-xs text-muted-foreground">
                Total today: $
                {((formState.setupCents + formState.monthlyCents) / 100).toLocaleString("en-US")}{" "}
                · Then ${(formState.monthlyCents / 100).toLocaleString("en-US")}/mo
              </p>
            )}
            <button
              type="button"
              disabled
              style={{ backgroundColor: agencyContext.brandColor }}
              className="px-4 py-1.5 rounded-[11px] text-white text-sm font-medium opacity-70 cursor-not-allowed"
            >
              Accept &amp; start →
            </button>
          </div>

          <p className="text-xs text-muted-foreground italic">{terms}</p>
        </div>
      </div>
    </div>
  );
}

function formatPriceUSD(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function substitute(copy: string, vars: Record<string, string>): string {
  return copy.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}
