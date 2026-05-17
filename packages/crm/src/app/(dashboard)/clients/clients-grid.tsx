// packages/crm/src/app/(dashboard)/clients/clients-grid.tsx
//
// Client-side shell for /clients. Owns the header (heading + usage
// badge + primary CTA) and the empty-state vs grid switch. Wires the
// at-limit click to <UpgradeModal> (Cut A primitive; do NOT redefine).
//
// Design-system audit (Task 14):
//   Usage badge   → <Badge variant=secondary|destructive> + <Tooltip>
//                   (1:1 with Cut A's CreateClientCta — same mental model)
//   Primary CTA   → <Button variant=default>; render={<Link/>} under
//                   limit, onClick to open modal at limit
//   Empty state   → <Card> + <Button size=lg> render=<Link/>
//   Grid          → native CSS grid (cols-1 md:cols-2 xl:cols-3)
//
// UpgradeModal prop contract (LOCKED from Cut A):
//   { open, onOpenChange, tier: "free" | "growth", used, limit }
//   — Scale tier coerced to "growth" defensively; Scale users can't hit
//   the at-limit branch anyway (cap is unlimited).

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Folder } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UpgradeModal } from "@/components/billing/upgrade-modal";
import type { WorkspaceSummary } from "@/lib/workspaces/summarize";
import { WorkspaceCard } from "./workspace-card";
import { CLIENTS_COPY } from "./copy";

type AgencyTier = "free" | "growth" | "scale";

export type ClientsGridProps = {
  workspaces: WorkspaceSummary[];
  tier: AgencyTier;
  used: number;
  limit: number;
};

function usageLabel(used: number, limit: number, tier: AgencyTier): string {
  if (tier === "scale" || !Number.isFinite(limit)) {
    return CLIENTS_COPY.usageBadge.unlimited;
  }
  if (used >= limit) {
    return CLIENTS_COPY.usageBadge.atLimit;
  }
  return CLIENTS_COPY.usageBadge.underLimit(used, limit);
}

function usageAriaLabel(
  used: number,
  limit: number,
  tier: AgencyTier,
): string {
  if (tier === "scale" || !Number.isFinite(limit)) {
    return "Unlimited client workspaces on Scale plan";
  }
  if (used >= limit) {
    return `Workspace limit reached — ${used} of ${limit} used`;
  }
  return `${used} of ${limit} client workspaces used`;
}

export function ClientsGrid({ workspaces, tier, used, limit }: ClientsGridProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const finite = Number.isFinite(limit);
  const atLimit = tier !== "scale" && finite && used >= limit;

  function handleCreateClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (atLimit) {
      setModalOpen(true);
    } else {
      router.push("/clients/new");
    }
  }

  return (
    <>
      {/* design-critique: sm:items-end → sm:items-center so the right
          cluster doesn't land mid-heading on narrow viewports where
          the heading wraps to two lines. */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
            {CLIENTS_COPY.pageHeading}
          </h1>
          <p className="text-sm text-muted-foreground">
            {CLIENTS_COPY.pageSubheading}
          </p>
        </div>
        {/* design-critique: hide the header CTA when empty. The empty
            state's own CTA is the only call to action on the page, so
            two competing CTAs (with different labels) flatten the
            hierarchy. Keep the header CTA only when workspaces exist. */}
        {workspaces.length > 0 ? (
          <TooltipProvider delay={150}>
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge
                      variant={atLimit ? "destructive" : "secondary"}
                      tabIndex={0}
                      aria-label={usageAriaLabel(used, limit, tier)}
                    />
                  }
                >
                  {usageLabel(used, limit, tier)}
                </TooltipTrigger>
                <TooltipContent>
                  {atLimit
                    ? CLIENTS_COPY.atLimitTooltip
                    : usageAriaLabel(used, limit, tier)}
                </TooltipContent>
              </Tooltip>
              {/* design-critique: at-limit drops the CTA to outline so
                  it stops competing with the destructive badge. Under
                  limit it stays as the default primary. */}
              <Button
                type="button"
                onClick={handleCreateClick}
                variant={atLimit ? "outline" : "default"}
                aria-haspopup={atLimit ? "dialog" : undefined}
              >
                {CLIENTS_COPY.primaryCta}
              </Button>
            </div>
          </TooltipProvider>
        ) : null}
      </header>

      {workspaces.length === 0 ? (
        <Card data-slot="clients-empty-state" className="mt-8">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div
              aria-label={CLIENTS_COPY.emptyState.illustrationAlt}
              role="img"
              className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground"
            >
              <Folder className="size-7" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              {CLIENTS_COPY.emptyState.heading}
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {CLIENTS_COPY.emptyState.body}
            </p>
            {/* 2026-05-17 — replaced `<Button render={<Link/>} nativeButton={false}>`
                with a plain styled <Link>. base-ui render-prop pattern
                swallowed clicks on Next.js Link. Same fix applied in
                create-client-cta.tsx and workspace-card.tsx. */}
            <Link
              href="/clients/new"
              className={buttonVariants({ size: "lg" })}
            >
              {CLIENTS_COPY.emptyState.cta}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <section
          aria-labelledby="clients-grid-heading"
          className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {/* a11y-review: sr-only heading so screen-reader heading
              navigation (H key) lands on a labeled section before
              diving into the first card's CardTitle. Replaces the
              aria-label-only approach so users have a true H2 in the
              outline tree. */}
          <h2 id="clients-grid-heading" className="sr-only">
            Client workspaces
          </h2>
          {workspaces.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </section>
      )}

      <UpgradeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        // UpgradeModal accepts "free" | "growth" only; Scale users
        // never reach the at-limit branch (cap is unlimited), so the
        // coercion is defensive — if it somehow runs, show the same
        // upgrade copy a Growth user would see.
        tier={tier === "scale" ? "growth" : tier}
        used={used}
        limit={finite ? limit : 0}
      />
    </>
  );
}
