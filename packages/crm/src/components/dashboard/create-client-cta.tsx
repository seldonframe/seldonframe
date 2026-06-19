// packages/crm/src/components/dashboard/create-client-cta.tsx
// Dashboard header CTA + workspace usage badge. Spec §"Dashboard CTA".
//
// Design system recommendation (Task 9.1):
//   - Button (default variant) from @/components/ui/button — same primary
//     surface as existing dashboard actions
//   - Badge from @/components/ui/badge — variant `secondary` under limit
//     (calm signal), variant `destructive` at limit (escalates the cue,
//     same color escalation as getFreeTierUsageBannerData)
//   - Tooltip from @/components/ui/tooltip (base-ui-backed) wrapping the
//     badge; requires the TooltipProvider mounted inline
//   - For under-limit, render Button asChild around a next/link Anchor
//     (shadcn convention) so the affordance is a real link, not a JS click
//   - Layout: flex items-center gap-3 matches the existing header's
//     right-side spacing (current header uses gap-2 sm:gap-3, identical)
//   - No new design tokens required
//
// UX copy (Task 9.2 via design:ux-copy):
//   See COPY const below. "Add" beats "Create" for the agency mental
//   model of stacking clients onto the same account. Tooltip uses an
//   em-dash separator so plan name + usage fit in one line.
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UpgradeModal } from "@/components/billing/upgrade-modal";

// User-facing strings — output of design:ux-copy (Task 9.2).
const COPY = {
  cta: "Add client workspace",
  tooltipTemplate: (tier: string, used: number, limit: number) => {
    const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
    if (!Number.isFinite(limit)) {
      return `On ${tierName} plan — unlimited workspaces`;
    }
    return `On ${tierName} plan — ${used} of ${limit} used`;
  },
};

export type CreateClientCtaProps = {
  tier: "free" | "growth" | "scale";
  used: number;
  limit: number;
};

export function CreateClientCta({ tier, used, limit }: CreateClientCtaProps) {
  const [open, setOpen] = useState(false);
  const finite = Number.isFinite(limit);
  const atLimit = finite && used >= limit;
  // a11y-review: visible label uses " / " for compactness; SR-only
  // aria-label rephrases as "X of Y client workspaces used" so screen
  // reader users hear meaning, not punctuation. The visible "/" stays
  // because it's the convention agencies expect.
  const usageLabel = finite
    ? `${used} / ${limit} workspaces`
    : `${used} workspaces`;
  const usageAriaLabel = finite
    ? `${used} of ${limit} client workspaces used`
    : `${used} client workspaces in use`;

  return (
    <TooltipProvider delay={150}>
      <div className="flex items-center gap-3">
        <Tooltip>
          {/* a11y-review:
              - tabIndex=0 makes the Badge focusable so keyboard users can
                summon the tooltip (base-ui shows the popup on focus too).
              - aria-label rephrases "X / Y workspaces" as a sentence so
                SR users don't hear "slash". base-ui's TooltipTrigger wires
                aria-describedby automatically when the tooltip opens — no
                manual id linkage needed. */}
          <TooltipTrigger
            render={
              <Badge
                variant={atLimit ? "destructive" : "secondary"}
                tabIndex={0}
                aria-label={usageAriaLabel}
              />
            }
          >
            {usageLabel}
          </TooltipTrigger>
          <TooltipContent>
            {COPY.tooltipTemplate(tier, used, limit)}
          </TooltipContent>
        </Tooltip>

        {atLimit ? (
          <>
            {/* a11y-review: aria-haspopup="dialog" tells SR rotors the
                button opens a modal — users hear "Add client workspace,
                button, has popup dialog" instead of being surprised by
                the modal opening on activation. */}
            <Button
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
            >
              {COPY.cta}
            </Button>
            <UpgradeModal
              open={open}
              onOpenChange={setOpen}
              // The modal renders the Workspace/Agency upgrade cards for any
              // current paid tier and the card-capture branch for
              // free/inactive. Pass the current tier straight through.
              tier={tier}
              used={used}
              limit={finite ? limit : 0}
            />
          </>
        ) : (
          // 2026-05-17 — replaced `<Button render={<Link/>} nativeButton={false}>`
          // with a plain styled <Link>. The base-ui render-prop pattern was
          // swallowing clicks on Next.js Link (button rendered correctly,
          // text visible, but clicks never navigated). Using buttonVariants
          // directly on the Link keeps the visual treatment identical and
          // navigation works out of the box.
          <Link
            href="/clients/new"
            className={buttonVariants({ variant: "default" })}
          >
            {COPY.cta}
          </Link>
        )}
      </div>
    </TooltipProvider>
  );
}
