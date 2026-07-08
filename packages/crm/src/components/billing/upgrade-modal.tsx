// packages/crm/src/components/billing/upgrade-modal.tsx
// Shared at-limit upgrade dialog. Surfaced from /clients, /clients/new's
// 402 path, and the dashboard "create client" CTA when the operator is at
// their workspace limit. DO NOT redefine this component elsewhere.
//
// 2026-06-18 pricing migration (Phase 3, LIVE on main / flag OFF): the
// upgrade targets are Workspace ($49, one full workspace) and Agency
// ($297, 10 client workspaces included, +$10/mo each beyond) — the
// GRANDFATHERED legacy tiers, which have real (already-configured)
// Stripe prices today.
//
// 2026-07-08 pricing ladder (flag ON, SF_TIER_LADDER via the
// NEXT_PUBLIC_ twin — see below): the upgrade targets switch to the new
// sellable ladder — Managed ($49, one workspace) and Agency Starter
// ($99, unlimited own workspaces + 10 client sub-accounts, whitelabel).
//
// POST-REVIEW FIX (blocking a live regression): this modal is a client
// component reached from a workspace-limit 402 anywhere in the app
// (dashboard CTA, /clients, /clients/new). Before this fix it
// unconditionally rendered the NEW ladder targets — but /api/stripe/
// checkout 409s "tier_unavailable" for managed/agency_starter until
// Max creates their Stripe prices and sets the env vars (Task 3's
// placeholder-price gate). That means every operator who hit the
// workspace limit got an upgrade button that silently failed, even
// though main's real (grandfathered) checkout worked fine. Flag-gating
// restores main's exact live behavior when SF_TIER_LADDER is off
// (today, and until Max's flip checklist — spec §6 — is complete).
//
// NEXT_PUBLIC_SF_TIER_LADDER is a build-time client-side twin of the
// server flag SF_TIER_LADDER (read server-side in pricing/page.tsx).
// This modal has no server-component ancestor in ANY of its 4+ call
// sites that would let a single server-read prop thread down cheaply,
// so it reads its own client-safe copy directly (same
// dark-by-default, strict-"1" contract as every other flag in this
// codebase) rather than threading a new prop through
// create-client-cta.tsx / clients-grid.tsx / clients-new-form.tsx /
// the dashboard + clients pages. Max must set BOTH env vars together
// at flip time (see the flip checklist).
//
// Design system (Task 7.1):
//   - Dialog / DialogContent / DialogHeader / DialogTitle / DialogDescription
//   - Card / CardContent / CardHeader / CardTitle for tier cards
//   - Button — variant="default" for the recommended CTA, "outline" / "ghost" otherwise
//   - Badge — marks the recommended tier "Recommended"
//   - Check icon from lucide-react for feature bullets
"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startCheckout } from "@/lib/billing/start-checkout";
import {
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  MANAGED_PRICE_ID,
  AGENCY_STARTER_PRICE_ID,
} from "@/lib/billing/price-ids";

/** Same strict-"1" contract as every other flag in this codebase
 *  (isWinLadderOn / isSimpleHomeOn / isTierLadderOn in
 *  app/pricing/page.tsx). Client-safe: NEXT_PUBLIC_ vars are inlined
 *  at build time. */
function isTierLadderOnClient(): boolean {
  return process.env.NEXT_PUBLIC_SF_TIER_LADDER?.trim() === "1";
}

type TierCard = {
  name: string;
  price: string;
  features: string[];
  cta: string;
  recommendedLabel?: string;
};

// ── Flag OFF (default) — main's LIVE targets, grandfathered tiers ──────
type LegacyUpgradeTarget = "workspace" | "agency";

const LEGACY_COPY: Record<LegacyUpgradeTarget, TierCard> = {
  workspace: {
    name: "Workspace",
    price: "$49/mo",
    features: [
      "1 full client workspace",
      "Website, booking, intake & CRM",
      "AI chatbot included",
      "Custom domain · no SeldonFrame branding",
    ],
    cta: "Upgrade to Workspace",
  },
  agency: {
    name: "Agency",
    price: "$297/mo",
    features: [
      "10 client workspaces included",
      "$10/mo per workspace beyond 10",
      "Full white-label platform",
      "Marketplace · priority support",
    ],
    cta: "Upgrade to Agency",
    recommendedLabel: "Recommended",
  },
};

const LEGACY_TIER_TO_PRICE_ID: Record<LegacyUpgradeTarget, string> = {
  workspace: WORKSPACE_PRICE_ID,
  agency: AGENCY_BASE_PRICE_ID,
};

// ── Flag ON — the new sellable ladder ───────────────────────────────────
type LadderUpgradeTarget = "managed" | "agency_starter";

const LADDER_COPY: Record<LadderUpgradeTarget, TierCard> = {
  managed: {
    name: "Managed",
    price: "$49/mo",
    features: [
      "1 full client workspace",
      "Website, booking, intake & CRM",
      "AI chatbot included",
      "Custom domain · no SeldonFrame branding",
    ],
    cta: "Upgrade to Managed",
  },
  agency_starter: {
    name: "Agency Starter",
    price: "$99/mo",
    features: [
      "Unlimited own workspaces",
      "10 client sub-accounts included",
      "Full white-label platform",
      "Client portal · marketplace",
    ],
    cta: "Upgrade to Agency Starter",
    recommendedLabel: "Recommended",
  },
};

const LADDER_TIER_TO_PRICE_ID: Record<LadderUpgradeTarget, string> = {
  managed: MANAGED_PRICE_ID,
  agency_starter: AGENCY_STARTER_PRICE_ID,
};

type UpgradeTarget = LegacyUpgradeTarget | LadderUpgradeTarget;

// User-facing strings — value-forward, no exclamation marks, no emoji.
const SHARED_COPY = {
  title: "Add another client workspace",
  // Card-capture branch headline (legacy "free"/inactive callers). Less
  // jargony than the tier-comparison wording: matches the limits.ts ask.
  freeTitle: "Add a card to unlock more workspaces",
  freeSubtitleTemplate: (used: number, limit: number) =>
    `You've used ${used}/${limit} workspace${limit === 1 ? "" : "s"}. Save a card to keep building — we won't charge it until you upgrade.`,
  freeCta: "Save a card and continue",
  freeDestination: "/signup/billing?next=/clients/new",
  subtitleTemplate: (used: number, limit: number) =>
    `You're using ${used} of ${limit} workspace${limit === 1 ? "" : "s"} on your current plan`,
  footer:
    "Every paid plan includes unlimited contacts, bookings, and Claude Code MCP access.",
  cancel: "Maybe later",
};

export type UpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current plan of the operator hitting the limit. Accepts legacy
   *  display values as well as the ladder so callers that still compute
   *  a legacy tier label keep type-checking; only the "free"/"inactive"
   *  branch changes the rendered surface. */
  tier:
    | "free"
    | "inactive"
    | "builder"
    | "managed"
    | "agency_starter"
    | "agency_growth"
    | "agency_scale"
    | "workspace"
    | "growth"
    | "scale"
    | "agency";
  used: number;
  limit: number;
};

export function UpgradeModal({ open, onOpenChange, tier, used, limit }: UpgradeModalProps) {
  const [pending, setPending] = useState<UpgradeTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ladderOn = isTierLadderOnClient();
  const targets: readonly UpgradeTarget[] = ladderOn ? ["agency_starter", "managed"] : ["agency", "workspace"];
  const COPY: Record<UpgradeTarget, TierCard> = ladderOn
    ? (LADDER_COPY as Record<UpgradeTarget, TierCard>)
    : (LEGACY_COPY as Record<UpgradeTarget, TierCard>);
  const TIER_TO_PRICE_ID: Record<UpgradeTarget, string> = ladderOn
    ? (LADDER_TIER_TO_PRICE_ID as Record<UpgradeTarget, string>)
    : (LEGACY_TIER_TO_PRICE_ID as Record<UpgradeTarget, string>);
  const recommendedTarget: UpgradeTarget = ladderOn ? "agency_starter" : "agency";

  async function upgrade(target: UpgradeTarget) {
    setPending(target);
    setError(null);
    try {
      const { url } = await startCheckout({
        priceId: TIER_TO_PRICE_ID[target],
        tier: target,
      });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout could not start. Try again.");
      setPending(null);
    }
  }

  // Card-capture branch — legacy "free"/"inactive" callers with no card on
  // file yet. Route them to the existing /signup/billing SetupIntent page
  // with ?next=/clients/new so they bounce back here once the card is
  // saved. Skips the tier comparison — that's downstream of "do they have
  // a card on file at all".
  if (tier === "free" || tier === "inactive") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{SHARED_COPY.freeTitle}</DialogTitle>
            <DialogDescription>{SHARED_COPY.freeSubtitleTemplate(used, limit)}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <Button
              onClick={() => {
                // Hard navigation — /signup/billing is a server-rendered
                // SetupIntent page; we don't want a client-side router
                // round trip muddling the Stripe Elements mount.
                window.location.href = SHARED_COPY.freeDestination;
              }}
              className="w-full"
            >
              {SHARED_COPY.freeCta}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label="Maybe later — close upgrade dialog"
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              {SHARED_COPY.cancel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{SHARED_COPY.title}</DialogTitle>
          <DialogDescription>{SHARED_COPY.subtitleTemplate(used, limit)}</DialogDescription>
        </DialogHeader>

        {/* The recommended tier (Agency / Agency Starter) gets ring-2 +
            shadow-md to back the "Recommended" badge; CTAs differentiate
            (lighter option=outline, recommended=default). The recommended
            target renders first so initial focus lands on it (matches
            visual hierarchy + SR reading order). */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {targets.map((target) => {
            const card = COPY[target];
            const isRecommended = target === recommendedTarget;
            return (
              <Card
                key={target}
                className={isRecommended ? "shadow-md ring-2 ring-primary" : undefined}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{card.name}</CardTitle>
                    {isRecommended && card.recommendedLabel ? (
                      <Badge variant="default">{card.recommendedLabel}</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium text-foreground">{card.price}</p>
                </CardHeader>
                <CardContent>
                  <ul className="mb-4 space-y-2 text-sm">
                    {card.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => upgrade(target)}
                    disabled={pending !== null}
                    aria-busy={pending === target}
                    variant={isRecommended ? "default" : "outline"}
                    className="w-full"
                  >
                    {pending === target ? "Redirecting..." : card.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <p className="mt-4 text-center text-xs text-muted-foreground">{SHARED_COPY.footer}</p>

        {/* "Maybe later" sits below the footer so the decision flow reads
            cards → value confirmation → escape. */}
        <div className="mt-6 text-center">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            aria-label="Maybe later — close upgrade dialog"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {SHARED_COPY.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
