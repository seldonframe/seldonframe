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
import { Button } from "@/components/ui/button";
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
  // a11y: badge text uses " / " with spaces so screen readers read it as
  // "X slash Y workspaces" (which announces sensibly in NVDA/VoiceOver
  // tests). Without the spaces, "/" gets glued to digits and rotors trip.
  const usageLabel = finite
    ? `${used} / ${limit} workspaces`
    : `${used} workspaces`;
  // Tooltip describes the badge — use aria-describedby via id linkage so
  // SR users get the plan context without the visual hover.
  const tooltipId = "create-client-cta-usage-tooltip";

  return (
    <TooltipProvider delay={150}>
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge
                variant={atLimit ? "destructive" : "secondary"}
                aria-describedby={tooltipId}
              />
            }
          >
            {usageLabel}
          </TooltipTrigger>
          <TooltipContent id={tooltipId}>
            {COPY.tooltipTemplate(tier, used, limit)}
          </TooltipContent>
        </Tooltip>

        {atLimit ? (
          <>
            <Button onClick={() => setOpen(true)}>{COPY.cta}</Button>
            <UpgradeModal
              open={open}
              onOpenChange={setOpen}
              // UpgradeModal accepts "free" | "growth" — Scale users never
              // hit the at-limit branch (cap is unlimited), so coerce
              // defensively to "growth" if it ever does.
              tier={tier === "scale" ? "growth" : (tier as "free" | "growth")}
              used={used}
              limit={finite ? limit : 0}
            />
          </>
        ) : (
          // base-ui Button uses the `render` prop (not shadcn's `asChild`)
          // to swap the underlying element. `nativeButton={false}` tells
          // base-ui to skip the `<button>` defaults and let the <a>
          // (Link's underlying tag) carry the role.
          <Button render={<Link href="/clients/new" />} nativeButton={false}>
            {COPY.cta}
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}
