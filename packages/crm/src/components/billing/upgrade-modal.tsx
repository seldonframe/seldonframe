// packages/crm/src/components/billing/upgrade-modal.tsx
// Shared at-limit upgrade dialog. Surfaced from /clients, /clients/new's
// 402 path, and the dashboard "create client" CTA when the operator is at
// their workspace limit. DO NOT redefine this component elsewhere.
//
// 2026-07-08 SECOND post-review fix wave (BLOCKING — same bug class as
// the pricing-shell.tsx single card): main's original modal targeted
// the GRANDFATHERED legacy tiers ("workspace" $49 / "agency" $297).
// Task 1's catalog made both `sellable: false`; Task 3's checkout
// route gates on Plan.sellable FLAG-INDEPENDENTLY, so posting
// tier:"workspace" or tier:"agency" now 409s tier_unavailable for
// EVERY caller, flag on or off. Flag OFF (default) now offers a
// SINGLE target — "builder" (the new $29 tier, wired to the SAME
// configured Stripe price as the grandfathered "workspace" tier used
// to use — see price-ids.ts's BUILDER_PRICE_ID). This is deliberately
// MINIMAL: main's modal offered "Agency $297, unlimited/10 included
// workspaces" as the upsell recommendation, but there is no sellable
// equivalent that preserves that semantic (agency_starter is $99 for
// CLIENT sub-accounts, a materially different offer, not "more of your
// own workspaces"). Rather than mis-sell agency_starter as a like-for-
// like Agency replacement, flag-off shows builder only; the agency
// ladder is reachable from /pricing once SF_TIER_LADDER is on.
//
// 2026-07-08 pricing ladder (flag ON, SF_TIER_LADDER via the
// NEXT_PUBLIC_ twin — see below): the upgrade targets are the new
// sellable ladder — Managed ($49, one workspace) and Agency Starter
// ($99, unlimited own workspaces + 10 client sub-accounts, whitelabel).
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

// 2026-07-08 hydration-mismatch fix ("no price id lives in the client",
// see pricing-shell-marketing.tsx's header for the full bug writeup) —
// this file used to import BUILDER_PRICE_ID / MANAGED_PRICE_ID /
// AGENCY_STARTER_PRICE_ID from lib/billing/price-ids DIRECTLY into a
// "use client" component, baking those (server-only-env-resolved, so
// always-placeholder-in-the-browser) values into the bundle purely to
// forward them in the checkout POST body. /api/stripe/checkout resolves
// the Stripe price id server-side from `tier` alone (checked FIRST,
// before any priceId fallback — see route.ts's targetTier resolution),
// so the client never needed a price id at all. startCheckout now sends
// only `{ tier }`.

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

// ── Flag OFF (default) — MINIMAL single sellable target ─────────────────
// 2026-07-08 post-review: "builder" only (see file-header comment for
// why this doesn't try to also offer an "agency-ish" second card).
type LegacyUpgradeTarget = "builder";

const LEGACY_COPY: Record<LegacyUpgradeTarget, TierCard> = {
  builder: {
    name: "Builder",
    price: "$29/mo",
    features: [
      "Unlimited own workspaces",
      "Website, booking, intake & CRM",
      "AI chatbot included",
      "Custom domain · no SeldonFrame branding",
    ],
    cta: "Upgrade to Builder",
  },
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
  // Flag off: MINIMAL — builder only (see file header). Flag on: the
  // real 2-target ladder comparison.
  const targets: readonly UpgradeTarget[] = ladderOn ? ["agency_starter", "managed"] : ["builder"];
  const COPY: Record<UpgradeTarget, TierCard> = ladderOn
    ? (LADDER_COPY as Record<UpgradeTarget, TierCard>)
    : (LEGACY_COPY as Record<UpgradeTarget, TierCard>);
  // No "recommended" badge makes sense with a single flag-off target.
  const recommendedTarget: UpgradeTarget | null = ladderOn ? "agency_starter" : null;

  async function upgrade(target: UpgradeTarget) {
    setPending(target);
    setError(null);
    try {
      const { url } = await startCheckout({ tier: target });
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

        {/* The recommended tier (Agency Starter, flag ON only) gets
            ring-2 + shadow-md to back the "Recommended" badge; CTAs
            differentiate (lighter option=outline, recommended=default).
            With a single flag-off target there's nothing to compare
            against, so its CTA renders as the normal primary action
            (not muted "outline"). The recommended target renders first
            so initial focus lands on it (matches visual hierarchy + SR
            reading order). */}
        <div className={targets.length > 1 ? "grid grid-cols-1 gap-4 md:grid-cols-2" : "grid grid-cols-1 gap-4"}>
          {targets.map((target) => {
            const card = COPY[target];
            const isRecommended = target === recommendedTarget;
            const isPrimaryCta = isRecommended || targets.length === 1;
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
                    variant={isPrimaryCta ? "default" : "outline"}
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
