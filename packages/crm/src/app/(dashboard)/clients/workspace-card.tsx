// packages/crm/src/app/(dashboard)/clients/workspace-card.tsx
//
// Renders a single workspace tile inside the /clients grid. Pure
// presentational component over WorkspaceSummary — no business logic,
// no fetches. Status-color + activity-time formatting are the only
// derivations.
//
// Design-system audit (Task 14):
//   Shell    → <Card> with hover/focus ring overlay
//   Title    → <CardTitle>
//   URL      → native <a target="_blank"> (no external-link primitive)
//   Status   → <Badge variant=outline> w/ semantic-token className for
//              active/setup; variant=secondary for paused
//   Stats    → native <dl><dt><dd> with bg-card/70 tiles
//   CTA      → <Button variant=outline size=sm> via render={<Link/>}

"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// Audit flag: this className override is the workaround for the missing
// `positive` + `caution` Badge variants. Promote to badge.tsx variants
// if any future surface uses these tokens.
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

type WorkspaceCardProps = {
  workspace: WorkspaceSummary;
};

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const statusLabel = CLIENTS_COPY.cardStatus[workspace.status];
  const publicHost = workspace.publicUrl.replace(/^https?:\/\//, "");

  return (
    // design-critique: dropped hover ring — the card isn't a single
    // clickable target (URL + CTA are independent links), so a
    // card-level hover affordance is misleading. focus-within ring
    // stays since it reflects a real focus state on a child element.
    <Card
      data-slot="workspace-card"
      className="transition-shadow focus-within:ring-foreground/30"
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{workspace.name}</CardTitle>
            <a
              href={workspace.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block max-w-full truncate text-xs text-muted-foreground hover:text-foreground"
            >
              {publicHost}
            </a>
          </div>
          <Badge
            variant={statusBadgeVariant(workspace.status)}
            className={statusBadgeClassName(workspace.status)}
          >
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Contacts
            </dt>
            <dd className="mt-1 text-base font-semibold text-foreground">
              {CLIENTS_COPY.formatContactCount(workspace.contactCount)}
            </dd>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Activity
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {formatRelativeTime(workspace.lastActivityAt)}
            </dd>
          </div>
        </dl>

        {/* design-critique: promoted from orphaned body text to a
            bullet-prefixed metadata strip. The dot anchors the row
            visually so it doesn't get skipped between the stat tiles
            and the CTA, but stays lighter than either neighbor. */}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="inline-block size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
          />
          {CLIENTS_COPY.formatLeadsThisWeek(workspace.newLeadsThisWeek)}
        </p>

        <div className="mt-auto pt-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={workspace.dashboardUrl} />}
            nativeButton={false}
          >
            {CLIENTS_COPY.cardCta}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
