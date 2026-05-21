"use client";
// packages/crm/src/app/(dashboard)/proposals/new/proposal-preview-pane.tsx
// 2026-05-20 — Phase B. Skeleton preview of the email + proposal page.
// Reactive to every form keystroke. No LLM call. No workspace provisioning.
// Final HTML is AI-generated only on Generate submit. Spec: §"Phase B Live preview".

import { useMemo } from "react";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

type Tier = "starter" | "growth" | "pro" | "custom";

const TIER_DEFAULTS: Record<Exclude<Tier, "custom">, number> = {
  starter: 29700,
  growth: 49700,
  pro: 99700,
};

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
    url: string;
    email: string;
    tier: Tier;
    customCents: string;
    setupFeeDollars: string;
  };
}) {
  // Derive a friendly hostname-based prospect name from the URL.
  // Edge cases handled: empty string → placeholder; malformed URL → placeholder;
  // URL without protocol → prepend https:// before parsing.
  const prospectName = useMemo(() => {
    if (!formState.url) return "[Prospect Name]";
    try {
      const u = new URL(
        formState.url.startsWith("http") ? formState.url : `https://${formState.url}`,
      );
      // "fixlyai.com" → "Fixlyai"; strips www. prefix before splitting
      const host = u.hostname.replace(/^www\./, "").split(".")[0];
      if (!host) return "[Prospect Name]";
      return host.charAt(0).toUpperCase() + host.slice(1);
    } catch {
      return "[Prospect Name]";
    }
  }, [formState.url]);

  const monthlyPriceCents =
    formState.tier === "custom"
      ? Math.max(5000, Math.round(Number(formState.customCents || "0") * 100))
      : TIER_DEFAULTS[formState.tier];

  const setupFeeCents = Math.max(
    0,
    Math.round(Number(formState.setupFeeDollars || "0") * 100),
  );

  // Substitute template variables. Missing keys are left as {{key}} so the
  // operator can see which placeholders they haven't filled in their template.
  const subject = substitute(agencyContext.template.subject, {
    prospectName,
    agencyName: agencyContext.name,
    price: formatPriceUSD(monthlyPriceCents),
  });
  const intro = substitute(agencyContext.template.introCopy, {
    prospectName,
    prospectFirstName: prospectName,
    agencyName: agencyContext.name,
  });
  const scope = substitute(agencyContext.template.scopeCopy, {
    agencyName: agencyContext.name,
  });
  const timeline = substitute(agencyContext.template.timelineCopy, {
    agencyName: agencyContext.name,
  });
  const terms = substitute(agencyContext.template.termsCopy, {
    agencyName: agencyContext.name,
  });

  return (
    // lg:sticky keeps the preview visible as the form scrolls on large screens.
    <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
      <h2 className="text-lg font-semibold tracking-tight">Live preview</h2>
      <p className="text-xs text-muted-foreground -mt-2">
        What your prospect will see. Updates as you type. (Final HTML is AI-generated on Generate.)
      </p>

      {/* Email preview */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Email
        </p>
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
            {setupFeeCents > 0 && (
              <span
                className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: agencyContext.brandColor }}
              >
                Setup fee active
              </span>
            )}
          </p>
          <p className="text-muted-foreground">Hi {prospectName},</p>
          <p className="text-muted-foreground">
            {agencyContext.name} put together a proposal for you. View it here:
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

      {/* Proposal page preview (skeleton) */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium px-4 pt-4">
          Proposal page
        </p>
        <div className="px-6 pb-6 space-y-4 pt-3">
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
            <p className="font-semibold">What&apos;s included</p>
            <p className="text-muted-foreground">{scope}</p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Timeline</p>
            <p className="text-muted-foreground">{timeline}</p>
          </div>

          {/* Booking page placeholder */}
          <div className="aspect-video rounded-lg border-2 border-dashed border-border/70 flex items-center justify-center text-xs text-muted-foreground">
            Live booking page preview (generated on Submit)
          </div>

          {/* Screenshot grid placeholder */}
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] rounded-md border border-border/70 bg-muted/40"
              />
            ))}
          </div>

          {/* Price block */}
          <div
            className="rounded-xl border-2 p-4 text-center space-y-2 transition-opacity duration-150"
            style={{ borderColor: agencyContext.brandColor }}
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Investment
            </p>
            {setupFeeCents > 0 && (
              <p
                className="text-xl font-semibold"
                style={{ color: agencyContext.brandColor }}
              >
                ${(setupFeeCents / 100).toLocaleString("en-US")}
                <span className="text-xs text-muted-foreground"> one-time setup</span>
              </p>
            )}
            <p
              className="text-2xl font-semibold"
              style={{ color: agencyContext.brandColor }}
            >
              ${(monthlyPriceCents / 100).toLocaleString("en-US")}
              <span className="text-xs text-muted-foreground"> / month</span>
            </p>
            {setupFeeCents > 0 && (
              <p className="text-xs text-muted-foreground">
                Total today: $
                {((setupFeeCents + monthlyPriceCents) / 100).toLocaleString("en-US")} · Then $
                {(monthlyPriceCents / 100).toLocaleString("en-US")}/mo
              </p>
            )}
            <button
              type="button"
              disabled
              style={{ backgroundColor: agencyContext.brandColor }}
              className="px-4 py-1.5 rounded-full text-white text-sm font-medium opacity-70 cursor-not-allowed"
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
