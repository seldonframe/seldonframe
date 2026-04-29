"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Building2,
  Columns,
  DollarSign,
  Filter,
  Search,
  Table as TableIcon,
  Target,
  TrendingUp,
} from "lucide-react";
import { moveDealStageAction } from "@/lib/deals/actions";

/**
 * WS2.2 — Engagements page kanban + table toggle.
 *
 * Renders the org's deals as either a Notion-style table or a Trello/Linear-
 * style kanban board, with HTML5 drag-and-drop between stages. Drops
 * fire an optimistic UI update + the existing `moveDealStageAction`
 * server action, which persists the stage + probability + closedAt
 * (for Won/Lost) to the deals row.
 *
 * Design references: Twenty CRM (table) + Linear (kanban). Uses the
 * existing `--sf-*` tokens via `bg-card`, `border`, `text-muted-foreground`
 * etc.; no hard-coded colors except per-stage accents which come from
 * `pipelines.stages[].color` (operator-customizable in /settings/pipeline).
 *
 * The view choice persists in localStorage under `seldon-deals-view`.
 * Default is "kanban" (per the WS2 spec — kanban is the headline
 * "feels like a real CRM" feature).
 */

export type DealRow = {
  id: string;
  title: string;
  contactId: string;
  stage: string;
  value: string; // numeric is returned as string by drizzle / postgres
  probability: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type StageDef = {
  name: string;
  color: string;
  probability: number;
};

export type DealsViewProps = {
  initialDeals: DealRow[];
  stages: StageDef[];
  contactById: Record<string, string>;
  contactLabelSingular: string;
  dealLabelPlural: string;
  /** Org's available stages (for filter dropdown — derived from data). */
  availableStages: string[];
  /** SSR-resolved query params (search/filter chrome stays URL-driven). */
  initialFilters: { search: string; stage: string; value: string };
};

const DRAG_MIME = "application/x-seldon-deal-id";

function compactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function fullCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCreatedDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function daysSince(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** Stable accent for stages where the pipeline didn't supply a color. */
function fallbackStageAccent(stage: string) {
  const lowered = stage.toLowerCase();
  if (lowered.includes("won")) return "#16a34a"; // emerald-600
  if (lowered.includes("lost")) return "#71717a"; // zinc-500
  if (lowered.includes("qualif")) return "#0284c7"; // sky-600
  if (lowered.includes("propos")) return "#9333ea"; // violet-600
  if (lowered.includes("negot")) return "#d97706"; // amber-600
  return "#64748b"; // slate-500
}

function applyMatch(deal: DealRow, contactName: string, filters: DealsViewProps["initialFilters"]) {
  const search = filters.search.toLowerCase();
  if (
    search &&
    !deal.title.toLowerCase().includes(search) &&
    !deal.stage.toLowerCase().includes(search) &&
    !contactName.toLowerCase().includes(search)
  ) {
    return false;
  }
  if (filters.stage !== "all" && deal.stage !== filters.stage) return false;
  const numericValue = Number(deal.value || 0);
  if (filters.value === "under10k" && numericValue >= 10_000) return false;
  if (filters.value === "10k-50k" && (numericValue < 10_000 || numericValue > 50_000)) return false;
  if (filters.value === "over50k" && numericValue <= 50_000) return false;
  return true;
}

export function DealsView({
  initialDeals,
  stages,
  contactById,
  contactLabelSingular,
  dealLabelPlural,
  availableStages,
  initialFilters,
}: DealsViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // SSR + first-paint default to Kanban (no localStorage read during render —
  // that would cause a hydration mismatch). useEffect below reads the
  // saved preference and may swap to Table after hydration.
  const [view, setView] = useState<"table" | "kanban">("kanban");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("seldon-deals-view");
      if (saved === "table" || saved === "kanban") setView(saved);
    } catch {
      // localStorage unavailable (private mode, etc.) — silent fallback.
    }
  }, []);

  const [deals, setDeals] = useState<DealRow[]>(initialDeals);
  const [dragError, setDragError] = useState<string | null>(null);

  // Sync local deals state when the server pushes a new initialDeals
  // (e.g. after router.refresh() following a successful mutation).
  useEffect(() => {
    setDeals(initialDeals);
  }, [initialDeals]);

  function handleSetView(next: "table" | "kanban") {
    setView(next);
    try {
      window.localStorage.setItem("seldon-deals-view", next);
    } catch {
      // ignore
    }
  }

  function handleStageChange(dealId: string, toStage: string) {
    if (!toStage) return;
    const stageDef = stages.find((s) => s.name === toStage);
    const newProbability = stageDef?.probability ?? 0;
    const original = deals;
    const optimistic = deals.map((d) =>
      d.id === dealId
        ? { ...d, stage: toStage, probability: newProbability, updatedAt: new Date().toISOString() }
        : d
    );
    if (
      optimistic.find((d) => d.id === dealId)?.stage ===
      original.find((d) => d.id === dealId)?.stage
    ) {
      return; // dropped on same column — no-op
    }
    setDeals(optimistic);
    setDragError(null);
    startTransition(async () => {
      try {
        await moveDealStageAction(dealId, toStage, newProbability);
        router.refresh();
      } catch (err) {
        setDeals(original);
        setDragError(
          err instanceof Error ? err.message : "Could not move deal — try again."
        );
      }
    });
  }

  // Apply filters BEFORE bucketing for kanban / sorting for table so both
  // views agree on what's displayed.
  const filteredDeals = useMemo(
    () =>
      deals.filter((d) => applyMatch(d, contactById[d.contactId] ?? "", initialFilters)),
    [deals, contactById, initialFilters]
  );

  const totalValue = filteredDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const wonCount = filteredDeals.filter(
    (d) => d.probability === 100 || d.stage.toLowerCase().includes("won")
  ).length;
  const winRate = filteredDeals.length
    ? Math.round((wonCount / filteredDeals.length) * 100)
    : 0;

  // Group filteredDeals into stage buckets. Stages from the pipeline drive
  // column ordering; any deals on stages NOT in the pipeline (legacy /
  // imported rows) appear in an "Other" column at the end so they're
  // never silently dropped.
  const knownStageNames = new Set(stages.map((s) => s.name));
  const buckets = new Map<string, DealRow[]>();
  for (const stage of stages) buckets.set(stage.name, []);
  const orphanDeals: DealRow[] = [];
  for (const deal of filteredDeals) {
    if (knownStageNames.has(deal.stage)) {
      buckets.get(deal.stage)!.push(deal);
    } else {
      orphanDeals.push(deal);
    }
  }

  return (
    <div className="space-y-6" data-pending={pending}>
      {/* Stat cards — driven by local `deals` state so kanban moves
          recompute totals before the server round-trip lands. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pipeline Value" value={compactCurrency(totalValue)} icon={DollarSign} />
        <StatCard label={`Active ${dealLabelPlural}`} value={String(filteredDeals.length)} icon={Building2} />
        <StatCard label="Win Rate" value={`${winRate}%`} icon={Target} />
        <StatCard label="Won Deals" value={String(wonCount)} icon={TrendingUp} />
      </div>

      {/* Filters + view toggle */}
      <div className="bg-card text-card-foreground rounded-xl border">
        <div className="flex flex-col gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b sm:flex-row sm:items-center sm:justify-between">
          <form method="get" className="flex flex-col sm:flex-row gap-2 sm:items-center flex-1">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                name="search"
                defaultValue={initialFilters.search}
                className="crm-input pl-9 h-9 w-full sm:w-[220px]"
                placeholder="Search deals..."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <select
                  name="stage"
                  defaultValue={initialFilters.stage}
                  className="crm-input h-9 w-[160px] pl-9 pr-3"
                >
                  <option value="all">All Stages</option>
                  {availableStages.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </div>
              <select
                name="value"
                defaultValue={initialFilters.value}
                className="crm-input h-9 w-[160px] px-3"
              >
                <option value="all">All Values</option>
                <option value="under10k">Under $10k</option>
                <option value="10k-50k">$10k - $50k</option>
                <option value="over50k">Over $50k</option>
              </select>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Apply
              </button>
            </div>
          </form>
          <ViewToggle view={view} onChange={handleSetView} />
        </div>

        {dragError ? (
          <div className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {dragError}
          </div>
        ) : null}

        {view === "kanban" ? (
          <KanbanBoard
            stages={stages}
            buckets={buckets}
            orphanDeals={orphanDeals}
            contactById={contactById}
            contactLabelSingular={contactLabelSingular}
            onDrop={handleStageChange}
          />
        ) : (
          <DealsTable
            deals={filteredDeals}
            contactById={contactById}
            contactLabelSingular={contactLabelSingular}
          />
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-card text-card-foreground rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{label}</span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="bg-muted/50 border rounded-lg p-4">
        <span className="text-2xl sm:text-3xl font-medium tracking-tight">{value}</span>
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "table" | "kanban";
  onChange: (next: "table" | "kanban") => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="View"
      className="inline-flex shrink-0 rounded-lg border bg-background p-0.5 self-end"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === "kanban"}
        onClick={() => onChange("kanban")}
        className={
          "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors " +
          (view === "kanban"
            ? "bg-card text-foreground shadow-(--shadow-xs)"
            : "text-muted-foreground hover:text-foreground")
        }
      >
        <Columns className="size-3.5" />
        Kanban
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "table"}
        onClick={() => onChange("table")}
        className={
          "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors " +
          (view === "table"
            ? "bg-card text-foreground shadow-(--shadow-xs)"
            : "text-muted-foreground hover:text-foreground")
        }
      >
        <TableIcon className="size-3.5" />
        Table
      </button>
    </div>
  );
}

function KanbanBoard({
  stages,
  buckets,
  orphanDeals,
  contactById,
  contactLabelSingular,
  onDrop,
}: {
  stages: StageDef[];
  buckets: Map<string, DealRow[]>;
  orphanDeals: DealRow[];
  contactById: Record<string, string>;
  contactLabelSingular: string;
  onDrop: (dealId: string, toStage: string) => void;
}) {
  return (
    <div className="overflow-x-auto p-3 sm:p-4">
      <div className="flex gap-3 sm:gap-4 min-w-max items-start">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.name}
            stage={stage}
            deals={buckets.get(stage.name) ?? []}
            contactById={contactById}
            contactLabelSingular={contactLabelSingular}
            onDrop={onDrop}
          />
        ))}
        {orphanDeals.length > 0 ? (
          <KanbanColumn
            stage={{ name: "Other", color: "#52525b", probability: 0 }}
            deals={orphanDeals}
            contactById={contactById}
            contactLabelSingular={contactLabelSingular}
            onDrop={onDrop}
          />
        ) : null}
      </div>
    </div>
  );
}

function KanbanColumn({
  stage,
  deals,
  contactById,
  contactLabelSingular,
  onDrop,
}: {
  stage: StageDef;
  deals: DealRow[];
  contactById: Record<string, string>;
  contactLabelSingular: string;
  onDrop: (dealId: string, toStage: string) => void;
}) {
  const [over, setOver] = useState(false);
  const accent = stage.color || fallbackStageAccent(stage.name);
  const totalValue = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const isWon = stage.name.toLowerCase().includes("won");
  const isLost = stage.name.toLowerCase().includes("lost");

  return (
    <div
      onDragOver={(e) => {
        // preventDefault enables the drop target.
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        // Only clear when leaving the column wrapper, not children.
        if (e.currentTarget === e.target) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const dealId = e.dataTransfer.getData(DRAG_MIME);
        if (dealId) onDrop(dealId, stage.name);
      }}
      className={
        "flex w-[280px] flex-col rounded-xl border transition-colors " +
        (over
          ? "border-primary/60 bg-primary/5 ring-2 ring-primary/40"
          : isWon
            ? "border-emerald-500/30 bg-emerald-500/5"
            : isLost
              ? "border-border bg-muted/20"
              : "border-border bg-background/50")
      }
    >
      <header
        className="flex items-center justify-between gap-2 border-b px-3 py-2.5"
        style={{ borderBottomColor: `${accent}40` }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
            <h3 className="truncate text-sm font-semibold text-foreground">{stage.name}</h3>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {deals.length} · {compactCurrency(totalValue)}
          </p>
        </div>
      </header>
      <div className="flex flex-col gap-2 p-2 min-h-[120px]">
        {deals.length === 0 ? (
          <div
            className={
              "rounded-lg border-2 border-dashed py-6 text-center text-[11px] " +
              (over ? "border-primary/60 text-primary" : "border-border/60 text-muted-foreground")
            }
          >
            Drag deals here
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              contactName={contactById[deal.contactId] || contactLabelSingular}
              accent={accent}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DealCard({
  deal,
  contactName,
  accent,
}: {
  deal: DealRow;
  contactName: string;
  accent: string;
}) {
  const [grabbing, setGrabbing] = useState(false);
  const value = Number(deal.value || 0);
  const days = daysSince(deal.updatedAt);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, deal.id);
        e.dataTransfer.effectAllowed = "move";
        setGrabbing(true);
      }}
      onDragEnd={() => setGrabbing(false)}
      style={{ borderLeftColor: accent }}
      className={
        "rounded-lg border border-border border-l-[3px] bg-card p-3 shadow-(--shadow-xs) transition-all " +
        (grabbing ? "opacity-50" : "hover:border-border/80 hover:shadow-(--shadow-card)") +
        " cursor-grab active:cursor-grabbing"
      }
    >
      <Link
        href={`/deals/${deal.id}`}
        className="block text-sm font-medium text-foreground line-clamp-2 hover:underline"
        onClick={(e) => {
          // Prevent the link click from triggering when actively dragging.
          if (grabbing) e.preventDefault();
        }}
      >
        {deal.title}
      </Link>
      <p className="mt-1 truncate text-xs text-muted-foreground">{contactName}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {value > 0 ? fullCurrency(value) : "—"}
        </span>
        {days != null ? (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            {days}d
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DealsTable({
  deals,
  contactById,
  contactLabelSingular,
}: {
  deals: DealRow[];
  contactById: Record<string, string>;
  contactLabelSingular: string;
}) {
  if (deals.length === 0) {
    return (
      <div className="px-3 py-12 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No deals match these filters.</p>
          <Link
            href="/deals/pipeline"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-sm text-background transition-colors hover:bg-foreground/90"
          >
            Create your first engagement
          </Link>
        </div>
      </div>
    );
  }

  const sorted = [...deals].sort((a, b) => Number(b.value) - Number(a.value));

  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="bg-muted/30 border-b">
            <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[200px]">
              Title
            </th>
            <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[180px]">
              Contact
            </th>
            <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[120px]">
              Stage
            </th>
            <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[120px]">
              Value
            </th>
            <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[110px]">
              Probability
            </th>
            <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[140px]">
              Created Date
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((deal) => {
            const contactName = contactById[deal.contactId] || contactLabelSingular;
            return (
              <tr
                key={deal.id}
                className="border-b transition-colors hover:bg-muted/30"
              >
                <td className="p-3 align-middle whitespace-nowrap">
                  <Link href={`/deals/${deal.id}`} className="font-medium hover:underline">
                    {deal.title}
                  </Link>
                </td>
                <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">
                  {contactName}
                </td>
                <td className="p-3 align-middle whitespace-nowrap">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: fallbackStageAccent(deal.stage) }}
                    />
                    {deal.stage}
                  </span>
                </td>
                <td className="p-3 align-middle whitespace-nowrap text-muted-foreground tabular-nums">
                  {compactCurrency(Number(deal.value))}
                </td>
                <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">
                  {deal.probability}%
                </td>
                <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">
                  {formatCreatedDate(deal.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
