// packages/crm/src/components/billing/upgrade-modal.tsx
// Shared at-limit upgrade dialog. Surfaced from /clients, /clients/new's
// 402 path, and the dashboard "create client" CTA when the operator is at
// their workspace limit. DO NOT redefine this component elsewhere.
//
// 2026-06-18 pricing migration (Phase 3): the upgrade targets are the new
// ladder — Workspace ($49, one full workspace) and Agency ($297, 10 client
// workspaces included, +$10/mo each beyond). The legacy Growth/Scale cards
// are gone. The "add another client workspace" framing maps to Agency
// (the multi-workspace tier), with Workspace as the lighter option.
//
// Design system (Task 7.1):
//   - Dialog / DialogContent / DialogHeader / DialogTitle / DialogDescription
//   - Card / CardContent / CardHeader / CardTitle for tier cards
//   - Button — variant="default" for the recommended CTA, "outline" / "ghost" otherwise
//   - Badge — marks the Agency tier "Recommended"
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
} from "@/lib/billing/price-ids";

type UpgradeTarget = "workspace" | "agency";

// User-facing strings — value-forward, no exclamation marks, no emoji.
const COPY = {
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
  footer:
    "Every paid plan includes unlimited contacts, bookings, and Claude Code MCP access.",
  cancel: "Maybe later",
};

// Real Stripe priceIds live in `lib/billing/price-ids.ts`. We pass both the
// priceId and the tier slug; /api/stripe/checkout recognizes the tier field
// and assembles the line item + metadata server-side via
// buildCheckoutSessionParams. Keeps secrets out of the client bundle.
const TIER_TO_PRICE_ID: Record<UpgradeTarget, string> = {
  workspace: WORKSPACE_PRICE_ID,
  agency: AGENCY_BASE_PRICE_ID,
};

export type UpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current plan of the operator hitting the limit. Accepts legacy
   *  display values ("free"/"growth"/"scale") as well as the new ladder
   *  so callers that still compute a legacy tier label keep type-checking;
   *  only the "free"/"inactive" branch changes the rendered surface. */
  tier: "free" | "inactive" | "builder" | "workspace" | "growth" | "scale" | "agency";
  used: number;
  limit: number;
};

export function UpgradeModal({ open, onOpenChange, tier, used, limit }: UpgradeModalProps) {
  const [pending, setPending] = useState<UpgradeTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            <DialogTitle>{COPY.freeTitle}</DialogTitle>
            <DialogDescription>{COPY.freeSubtitleTemplate(used, limit)}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <Button
              onClick={() => {
                // Hard navigation — /signup/billing is a server-rendered
                // SetupIntent page; we don't want a client-side router
                // round trip muddling the Stripe Elements mount.
                window.location.href = COPY.freeDestination;
              }}
              className="w-full"
            >
              {COPY.freeCta}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label="Maybe later — close upgrade dialog"
              className="w-full text-sm text-muted-foreground hover:text-foreground"
            >
              {COPY.cancel}
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
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.subtitleTemplate(used, limit)}</DialogDescription>
        </DialogHeader>

        {/* Agency gets ring-2 + shadow-md to back the "Recommended" badge;
            CTAs differentiate (Workspace=outline, Agency=default). Agency
            renders first so initial focus lands on the recommended upgrade
            path (matches visual hierarchy + SR reading order). */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["agency", "workspace"] as const).map((target) => {
            const card = COPY[target];
            const isAgency = target === "agency";
            return (
              <Card
                key={target}
                className={isAgency ? "shadow-md ring-2 ring-primary" : undefined}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{card.name}</CardTitle>
                    {isAgency ? (
                      <Badge variant="default">{COPY.agency.recommendedLabel}</Badge>
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
                    variant={isAgency ? "default" : "outline"}
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

        <p className="mt-4 text-center text-xs text-muted-foreground">{COPY.footer}</p>

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
            {COPY.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
