// packages/crm/src/app/(dashboard)/clients/clients-grid.tsx
//
// 2026-05-19 — Redesigned client-side shell for /clients. Owns the
// hero header (heading + active-count chip + usage badge + primary
// CTA), the empty-state vs grid switch, and the at-limit
// <UpgradeModal> wiring (Cut A primitive — DO NOT redefine).
//
// Why the redesign: operators love the visual quality of
// /clients/[slug]/ready (big heading, status pills, deliverable cards
// with mini-stat tiles). The /clients list page was functional but
// uninspiring by comparison — same data, weaker presentation. This
// rev brings them in line so an agency owner who lands on /clients
// immediately sees (1) which clients are live, (2) how to spin up a
// new one, and (3) at-a-glance health per workspace.
//
// Hero CTA is the SeldonFrame primary button (crm-pressable +
// crm-button-primary visual tokens), mirroring the "Open dashboard"
// CTA on the ready page. Empty state is a styled full-width hero card
// (not the previous bare Card) with the same border + bg + padding
// language as the workspace tiles.

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const activeCount = useMemo(
    () => workspaces.filter((w) => w.status === "active").length,
    [workspaces],
  );

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
      {/* ============== HERO HEADER ============== */}
      {/* Mirrors the visual language of /clients/[slug]/ready: a
          space-y-3 stack with a big heading, supporting lede, and a
          cluster of stat-chip + primary CTA on the right. The active
          count chip + usage badge live together so the operator sees
          health AND headroom at a glance. */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {CLIENTS_COPY.pageHeading}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-[15px]">
              {CLIENTS_COPY.pageSubheading}
            </p>
          </div>
          {workspaces.length > 0 ? (
            <TooltipProvider delay={150}>
              <div className="flex flex-wrap items-center gap-2.5">
                {activeCount > 0 ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                    aria-label={`${activeCount} active workspaces`}
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-emerald-500"
                    />
                    {CLIENTS_COPY.formatActiveCount(activeCount)}
                  </span>
                ) : null}
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
                <Button
                  type="button"
                  onClick={handleCreateClick}
                  variant={atLimit ? "outline" : "default"}
                  aria-haspopup={atLimit ? "dialog" : undefined}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {CLIENTS_COPY.primaryCta}
                </Button>
              </div>
            </TooltipProvider>
          ) : null}
        </div>
      </header>

      {/* ============== EMPTY STATE ============== */}
      {workspaces.length === 0 ? (
        <section
          data-slot="clients-empty-state"
          className="mt-8 rounded-2xl border border-border/70 bg-card/40 p-8 sm:p-12"
        >
          <div className="mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
            <div
              aria-label={CLIENTS_COPY.emptyState.illustrationAlt}
              role="img"
              className="flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"
            >
              <Sparkles className="size-7" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {CLIENTS_COPY.emptyState.heading}
              </h2>
              <p className="text-sm text-muted-foreground sm:text-[15px]">
                {CLIENTS_COPY.emptyState.body}
              </p>
            </div>
            {/* 2026-05-17 — replaced `<Button render={<Link/>} nativeButton={false}>`
                with a plain styled <Link>. base-ui's render-prop pattern
                was swallowing clicks on Next.js Link (renders fine, no
                navigation). Same fix applied across the surface. */}
            <Link
              href="/clients/new"
              className="crm-pressable inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-(--shadow-sm) transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90"
            >
              {CLIENTS_COPY.emptyState.cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : (
        <section
          aria-labelledby="clients-grid-heading"
          className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {/* a11y-review: sr-only heading so screen-reader heading
              navigation (H key) lands on a labeled section before
              diving into the first card's CardTitle. */}
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
