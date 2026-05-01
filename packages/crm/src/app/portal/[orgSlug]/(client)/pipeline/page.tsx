// Client Portal — Pipeline page (May 1, 2026).
//
// Read-only kanban-style view of the authenticated client's own deals.
// Clients see progress + stage + value. They CAN'T drag cards (operators
// do that on the admin dashboard). Pipeline stages come from the
// workspace's default pipeline so the empty state still shows the
// shape of the funnel.

import { listPortalDeals } from "@/lib/portal/actions";

interface PortalDealStage {
  name: string;
  color: string;
  probability: number;
}

function formatCurrency(value: string | number, currency: string) {
  const num = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(num)) return "—";
  try {
    return num.toLocaleString("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } catch {
    return `$${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
}

function daysAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const ts = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export default async function PortalPipelinePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { deals, stages } = await listPortalDeals(orgSlug);

  // The legacy pipelines.stages JSON shape is `{ name, color, probability }`.
  // Cast loosely here to avoid bringing the full Drizzle type into the
  // portal page module.
  const stageList = (stages as PortalDealStage[]) ?? [];

  // Group deals by stage name. Deals whose stored stage doesn't match
  // any current pipeline stage land in a "Other" bucket so they don't
  // disappear from the operator's view of the client's progress.
  const dealsByStage = new Map<string, typeof deals>();
  for (const stage of stageList) {
    dealsByStage.set(stage.name, []);
  }
  for (const deal of deals) {
    const stageName = (deal as { stage?: string | null }).stage ?? "Other";
    if (!dealsByStage.has(stageName)) dealsByStage.set(stageName, []);
    dealsByStage.get(stageName)!.push(deal);
  }

  if (deals.length === 0 && stageList.length === 0) {
    return (
      <section className="space-y-4">
        <div>
          <p className="text-label text-[hsl(var(--color-text-muted))]">My Pipeline</p>
          <h2 className="text-section-title">Track your projects</h2>
        </div>
        <article className="crm-card text-center py-12">
          <p className="text-foreground font-medium">No active projects yet</p>
          <p className="mt-1 text-sm text-[hsl(var(--color-text-secondary))]">
            Your pipeline will appear here once a project starts.
          </p>
        </article>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-label text-[hsl(var(--color-text-muted))]">My Pipeline</p>
        <h2 className="text-section-title">Track your projects</h2>
        <p className="mt-1 text-sm text-[hsl(var(--color-text-secondary))]">
          Read-only view of your active deals. Updates land here as your
          operator moves them through stages.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        {stageList.map((stage) => {
          const cards = dealsByStage.get(stage.name) ?? [];
          return (
            <article
              key={stage.name}
              className="crm-card flex flex-col gap-3 min-h-[240px]"
            >
              <header className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: stage.color }}
                    aria-hidden="true"
                  />
                  <h3 className="text-card-title">{stage.name}</h3>
                </div>
                <span className="text-xs text-[hsl(var(--color-text-muted))]">
                  {cards.length}
                </span>
              </header>
              {cards.length === 0 ? (
                <p className="text-xs text-[hsl(var(--color-text-muted))]">
                  No deals at this stage.
                </p>
              ) : (
                <ul className="space-y-2">
                  {cards.map((deal) => {
                    const value = (deal as { value?: string | number }).value ?? 0;
                    const currency =
                      (deal as { currency?: string }).currency ?? "USD";
                    const updatedAt = (deal as { updatedAt?: Date | string }).updatedAt;
                    return (
                      <li
                        key={(deal as { id: string }).id}
                        className="rounded-lg border border-border bg-background p-3 text-sm"
                      >
                        <p className="font-medium text-foreground">
                          {(deal as { title: string }).title}
                        </p>
                        <p className="mt-1 text-xs text-[hsl(var(--color-text-secondary))]">
                          {formatCurrency(value, currency)}
                          {updatedAt ? ` · updated ${daysAgo(updatedAt)}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
