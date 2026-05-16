// packages/crm/src/components/billing/upgrade-modal.tsx
// Cut A first consumer is /clients/new's 402 path; Cut B reuses this from
// /clients and from the dashboard CTA at-limit click; Cut C may surface it
// from marketing CTAs. DO NOT redefine this component in later Cuts.
//
// Design system recommendation (Task 7.1):
//   - Dialog / DialogContent / DialogHeader / DialogTitle / DialogDescription
//     from @/components/ui/dialog (shadcn/base-ui shell)
//   - Card / CardContent / CardHeader / CardTitle from @/components/ui/card
//     for tier cards
//   - Button from @/components/ui/button — variant="default" for upgrade CTAs,
//     variant="ghost" for "Maybe later"
//   - Badge from @/components/ui/badge — mark Scale tier as "Recommended"
//   - Check icon from lucide-react for feature bullets
//   - Override DialogContent max-w to max-w-3xl for side-by-side cards
//   - No new design tokens needed
//
// Copy (Task 7.2 via design:ux-copy):
//   See COPY const below — value-forward, no exclamation marks, no emoji.
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
  GROWTH_MONTHLY_PRICE_ID,
  SCALE_MONTHLY_PRICE_ID,
} from "@/lib/billing/price-ids";

// User-facing strings — output of design:ux-copy (Task 7.2).
const COPY = {
  title: "Add another client workspace",
  subtitleTemplate: (used: number, limit: number) =>
    `You're on Free with ${used} of ${limit} workspaces used`,
  growth: {
    name: "Growth",
    price: "$29/mo per agency",
    features: [
      "3 client workspaces",
      "Custom domain per client",
      "No SeldonFrame branding",
      "Client portal access",
    ],
    cta: "Upgrade to Growth",
  },
  scale: {
    name: "Scale",
    price: "$99/mo per agency",
    features: [
      "Unlimited client workspaces",
      "AI agents for every workspace",
      "Full white-label client portal",
      "Priority support response",
    ],
    cta: "Upgrade to Scale",
    recommendedLabel: "Recommended",
  },
  footer:
    "Both tiers include unlimited contacts, bookings, and Claude Code MCP access.",
  cancel: "Maybe later",
};

// Real Stripe priceIds live in `lib/billing/price-ids.ts` (Growth + Scale
// monthly IDs added in Cut B Phase 1). We pass both the priceId and the tier
// slug; the existing /api/stripe/checkout route at line 117+136 recognizes
// the tier field and assembles the multi-price line items server-side via
// buildCheckoutLineItemsForTier. Keeps secrets out of the client bundle.
const TIER_TO_PRICE_ID: Record<"growth" | "scale", string> = {
  growth: GROWTH_MONTHLY_PRICE_ID,
  scale: SCALE_MONTHLY_PRICE_ID,
};

export type UpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tier: "free" | "growth";
  used: number;
  limit: number;
};

export function UpgradeModal({ open, onOpenChange, used, limit }: UpgradeModalProps) {
  const [pending, setPending] = useState<"growth" | "scale" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upgrade(target: "growth" | "scale") {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.subtitleTemplate(used, limit)}</DialogDescription>
        </DialogHeader>

        {/* design-critique: Scale gets ring-2 + shadow-md to visually back the
            "Recommended" badge; CTAs differentiate (Growth=outline, Scale=default).
            a11y-review: Scale renders first so initial focus lands on the
            recommended upgrade path (matches visual hierarchy + SR reading order). */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["scale", "growth"] as const).map((tier) => {
            const card = COPY[tier];
            const isScale = tier === "scale";
            return (
              <Card
                key={tier}
                className={isScale ? "shadow-md ring-2 ring-primary" : undefined}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{card.name}</CardTitle>
                    {isScale ? (
                      <Badge variant="default">{COPY.scale.recommendedLabel}</Badge>
                    ) : null}
                  </div>
                  {/* a11y-review: promoted from text-muted-foreground to
                      text-foreground+font-medium to guarantee >=4.5:1 contrast
                      across all themes (was at risk in light theme). */}
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
                    onClick={() => upgrade(tier)}
                    disabled={pending !== null}
                    aria-busy={pending === tier}
                    variant={isScale ? "default" : "outline"}
                    className="w-full"
                  >
                    {pending === tier ? "Redirecting..." : card.cta}
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

        {/* design-critique: "Maybe later" sits below the footer (not adjacent to
            the upgrade CTAs) so the decision flow reads cards → value confirmation
            → escape. Uses Button ghost variant per design-system audit.
            a11y-review: aria-label disambiguates the SR rotor label so users
            scanning interactive elements know what "Maybe later" closes. */}
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
