// packages/crm/src/app/(dashboard)/clients/workspace-card.tsx
//
// 2026-05-19 — Redesigned to match the visual language of
// /clients/[slug]/ready. The previous incarnation used the generic
// Card primitive with a tight 2-stat layout; the redesign promotes
// each workspace tile to a richer "what you built" card that mirrors
// the ready page's deliverable grid:
//
//   • Workspace name + ORIGINAL brand URL prominently displayed under
//     the name (this is the brand the operator built FOR — the
//     auto-generated subdomain falls back to as "preview" when no
//     original URL is on file).
//   • Status pill using the same emerald/amber/secondary palette as
//     the ready page's audience chips.
//   • 2x2 mini-stat grid (contacts / leads this week / bookings this
//     week / last activity) — same `rounded-xl border bg-card/70`
//     tiles the ready page uses for its "what you built" cards.
//   • "Open dashboard" as the primary action at the bottom, paired
//     with an "Open public site" secondary link when there's an
//     original URL on file.
//   • rounded-2xl + border-border/80 + bg-card/80 + p-5 shell to
//     match the ready page's container language.

"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WorkspaceSummary, WorkspaceStatus } from "@/lib/workspaces/summarize";
import { CLIENTS_COPY } from "./copy";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return CLIENTS_COPY.activity.none;
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  if (days === 1) return CLIENTS_COPY.activity.yesterday;
  if (days < 30) return `${days} days ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

// Status pill colors — emerald/amber match the ready page's audience
// chips so the operator pattern-matches "active = green = good" across
// surfaces. Paused stays neutral (uses Badge variant="secondary").
function statusBadgeClassName(status: WorkspaceStatus): string | undefined {
  switch (status) {
    case "active":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "setup":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "paused":
      return undefined; // use variant="secondary" instead
  }
}

function statusBadgeVariant(status: WorkspaceStatus): "outline" | "secondary" {
  return status === "paused" ? "secondary" : "outline";
}

/** Strip protocol from a URL so it renders compactly under the name. */
function displayHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  }
}

type WorkspaceCardProps = {
  workspace: WorkspaceSummary;
};

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const statusLabel = CLIENTS_COPY.cardStatus[workspace.status];
  // Prefer the brand URL (the URL the operator pasted into /clients/new)
  // — that's what the operator built FOR. Fall back to the
  // SeldonFrame subdomain when no brand URL is on file (workspaces
  // created via Google paste, manual setup, etc.).
  const brandHref = workspace.originalSiteUrl ?? workspace.publicUrl;
  const brandLabel = displayHost(brandHref);
  const brandIsOriginal = workspace.originalSiteUrl != null;

  return (
    // a11y-review: wrap in <article> so screen-reader landmark
    // navigation announces "article" framing for each workspace tile.
    <article
      aria-labelledby={`workspace-${workspace.id}-title`}
      data-slot="workspace-card"
      className="group flex h-full flex-col gap-4 rounded-2xl border border-border/80 bg-card/80 p-5 shadow-(--shadow-sm) transition-shadow duration-200 ease-out hover:shadow-(--shadow-card-hover) focus-within:ring-2 focus-within:ring-foreground/20"
    >
      {/* ============== HEADER ============== */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2
            id={`workspace-${workspace.id}-title`}
            className="truncate text-lg font-semibold leading-tight text-foreground"
          >
            {workspace.name}
          </h2>
          <a
            href={brandHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${brandLabel} — opens in a new tab`}
            className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="truncate">{brandLabel}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          </a>
        </div>
        <Badge
          variant={statusBadgeVariant(workspace.status)}
          className={statusBadgeClassName(workspace.status)}
        >
          {statusLabel}
        </Badge>
      </header>

      {/* ============== 2x2 STATS GRID ============== */}
      {/* Mirrors the ready page's "what you built in 60 seconds" card
          tiles — same border + bg + label-on-top layout so the two
          pages feel like one design system. */}
      <dl className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {CLIENTS_COPY.cardStatLabels.contacts}
          </dt>
          <dd className="mt-1 text-base font-semibold text-foreground">
            {workspace.contactCount}
          </dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {CLIENTS_COPY.cardStatLabels.leads}
          </dt>
          <dd className="mt-1 text-base font-semibold text-foreground">
            {workspace.newLeadsThisWeek}
          </dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {CLIENTS_COPY.cardStatLabels.bookings}
          </dt>
          <dd className="mt-1 text-base font-semibold text-foreground">
            {workspace.bookingsThisWeek}
          </dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/70 p-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {CLIENTS_COPY.cardStatLabels.activity}
          </dt>
          <dd className="mt-1 truncate text-sm font-medium text-foreground">
            {formatRelativeTime(workspace.lastActivityAt)}
          </dd>
        </div>
      </dl>

      {/* ============== ACTIONS ============== */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Link
          href={workspace.dashboardUrl}
          className="crm-pressable inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-(--shadow-sm) transition-[background-color,transform] duration-150 ease-out hover:bg-primary/90 sm:flex-none sm:px-4"
        >
          {CLIENTS_COPY.cardCta}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
        {brandIsOriginal ? (
          <a
            href={brandHref}
            target="_blank"
            rel="noopener noreferrer"
            className="crm-pressable inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background/40 px-3 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-background/80 hover:text-foreground"
          >
            Visit site
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </article>
  );
}
