"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Building2,
  Columns,
  DollarSign,
  Filter,
  Plus,
  Search,
  Table as TableIcon,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { moveDealStageAction, quickCreateDealAction } from "@/lib/deals/actions";
import { setDealsViewAction, type DealsViewMode } from "@/lib/deals/view-cookie";

/**
 * WS2.2 v2 — Twenty-style Engagements kanban.
 *
 * Replaces the v1 (HTML5 native drag-drop + localStorage view toggle)
 * with @dnd-kit primitives + cookie-based view persistence so the SSR
 * renders the operator's preferred view on first paint (no flash).
 *
 * Design references: Twenty CRM kanban shell + Linear card density.
 * Uses dashboard tokens (`bg-card` / `border-border` / `text-muted-foreground` /
 * `text-foreground` / `bg-primary`) to match sidebar + topbar — the
 * `--sf-*` namespace called out in the WS2 spec is reserved for the
 * public-facing renderer output (calcom-month-v1, formbricks-stack-v1)
 * and would clash with the dashboard's shadcn-style theming.
 *
 * Drag-drop:
 *   - Card = useDraggable. Custom `data: { type: "deal", deal }` payload.
 *   - Column drop zone = useDroppable. `data: { type: "column", stageName }`.
 *   - Optimistic state update on drag end → moveDealStageAction persists.
 *   - On error: revert + inline banner.
 *
 * Inline create:
 *   - Each column ends with a "+ Add deal" affordance that opens a
 *     mini-form (title + contact + value). quickCreateDealAction returns
 *     { ok, error } so validation surfaces inline rather than crashing.
 *
 * Pointer sensor uses an 8px activation distance so single-clicks on
 * the deal title still navigate to /deals/[id] without triggering drag.
 */

export type DealRow = {
  id: string;
  title: string;
  contactId: string;
  stage: string;
  value: string; // drizzle numeric → string
  probability: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type StageDef = {
  name: string;
  color: string;
  probability: number;
};

export type ContactOption = {
  id: string;
  name: string;
};

export type DealsViewProps = {
  initialDeals: DealRow[];
  stages: StageDef[];
  contactById: Record<string, string>;
  contactOptions: ContactOption[];
  contactLabelSingular: string;
  dealLabelPlural: string;
  availableStages: string[];
  initialFilters: { search: string; stage: string; value: string };
  initialView: DealsViewMode;
};

/* ────────────────────────────── helpers ────────────────────────────── */

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

function daysSince(value: string | Date): number | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function fallbackStageAccent(stage: string): string {
  const lowered = stage.toLowerCase();
  if (lowered.includes("won")) return "#16a34a";
  if (lowered.includes("lost")) return "#71717a";
  if (lowered.includes("qualif")) return "#0284c7";
  if (lowered.includes("propos")) return "#9333ea";
  if (lowered.includes("negot")) return "#d97706";
  return "#64748b";
}

function applyMatch(
  deal: DealRow,
  contactName: string,
  filters: DealsViewProps["initialFilters"]
) {
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

/* ────────────────────────────── DealsView ────────────────────────────── */

export function DealsView({
  initialDeals,
  stages,
  contactById,
  contactOptions,
  contactLabelSingular,
  dealLabelPlural,
  availableStages,
  initialFilters,
  initialView,
}: DealsViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [view, setView] = useState<DealsViewMode>(initialView);
  function handleSetView(next: DealsViewMode) {
    setView(next);
    void setDealsViewAction(next);
  }

  const [deals, setDeals] = useState<DealRow[]>(initialDeals);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Sync local state when the server pushes new data (router.refresh()
  // after a mutation, or a SSR re-render with different props).
  useEffect(() => {
    setDeals(initialDeals);
  }, [initialDeals]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
    setErrorBanner(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = String(active.id);
    const overData = over.data.current as
      | { type: "column"; stageName: string }
      | { type: "deal"; deal: DealRow }
      | undefined;

    let toStage: string | null = null;
    if (overData?.type === "column") toStage = overData.stageName;
    else if (overData?.type === "deal") toStage = overData.deal.stage;
    if (!toStage) return;

    const original = deals;
    const dealRow = original.find((d) => d.id === dealId);
    if (!dealRow || dealRow.stage === toStage) return;

    const stageDef = stages.find((s) => s.name === toStage);
    const newProbability = stageDef?.probability ?? 0;

    setDeals(
      original.map((d) =>
        d.id === dealId
          ? {
              ...d,
              stage: toStage!,
              probability: newProbability,
              updatedAt: new Date().toISOString(),
            }
          : d
      )
    );

    startTransition(async () => {
      try {
        await moveDealStageAction(dealId, toStage!, newProbability);
        router.refresh();
      } catch (err) {
        setDeals(original);
        setErrorBanner(
          err instanceof Error ? err.message : "Could not move deal — try again."
        );
      }
    });
  }

  // Filter BEFORE bucketing for kanban / sorting for table.
  const filteredDeals = useMemo(
    () => deals.filter((d) => applyMatch(d, contactById[d.contactId] ?? "", initialFilters)),
    [deals, contactById, initialFilters]
  );

  const totalValue = filteredDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const wonCount = filteredDeals.filter(
    (d) => d.probability === 100 || d.stage.toLowerCase().includes("won")
  ).length;
  const winRate = filteredDeals.length
    ? Math.round((wonCount / filteredDeals.length) * 100)
    : 0;

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

  const activeDragDeal = activeDragId ? deals.find((d) => d.id === activeDragId) : null;
  const activeDragAccent = activeDragDeal
    ? stages.find((s) => s.name === activeDragDeal.stage)?.color || fallbackStageAccent(activeDragDeal.stage)
    : "#64748b";

  return (
    <div className="space-y-6" data-pending={pending}>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Pipeline Value"
          value={compactCurrency(totalValue)}
          icon={DollarSign}
          tone="primary"
        />
        <StatCard
          label={`Active ${dealLabelPlural}`}
          value={String(filteredDeals.length)}
          icon={Building2}
        />
        <StatCard label="Win Rate" value={`${winRate}%`} icon={Target} tone="positive" />
        <StatCard label="Won Deals" value={String(wonCount)} icon={TrendingUp} tone="positive" />
      </div>

      {/* Filter chrome + view toggle */}
      <div className="rounded-xl border bg-card text-card-foreground">
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

        {errorBanner ? (
          <div className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {errorBanner}
          </div>
        ) : null}

        {view === "kanban" ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <KanbanBoard
              stages={stages}
              buckets={buckets}
              orphanDeals={orphanDeals}
              contactById={contactById}
              contactOptions={contactOptions}
              contactLabelSingular={contactLabelSingular}
              activeDragId={activeDragId}
              onDealCreated={(deal) => {
                setDeals((current) => [...current, deal]);
                router.refresh();
              }}
            />
            <DragOverlayPortal
              activeDragDeal={activeDragDeal ?? null}
              accent={activeDragAccent}
              contactName={
                activeDragDeal
                  ? contactById[activeDragDeal.contactId] || contactLabelSingular
                  : ""
              }
            />
          </DndContext>
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

/* ────────────────────────── drag overlay portal ────────────────────────── */

/**
 * Renders the DragOverlay through a portal to `document.body` so the
 * ancestor `animate-page-enter` element's CSS transform doesn't break
 * the overlay's `position: fixed` positioning. Per CSS spec, any
 * non-`none` transform creates a containing block for fixed
 * descendants — which made @dnd-kit's overlay position itself
 * relative to the dashboard chrome instead of the viewport,
 * producing a visible cursor offset. Portaling to body restores
 * viewport-relative positioning so the overlay tracks the pointer
 * exactly.
 *
 * Wrapped in its own component so the createPortal call's React 19
 * `ReactPortal` return type doesn't pollute the outer JSX.
 */
function DragOverlayPortal({
  activeDragDeal,
  accent,
  contactName,
}: {
  activeDragDeal: DealRow | null;
  accent: string;
  contactName: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const overlay = (
    <DragOverlay dropAnimation={null}>
      {activeDragDeal ? (
        <DealCardSurface
          deal={activeDragDeal}
          contactName={contactName}
          accent={accent}
          isFloating
        />
      ) : null}
    </DragOverlay>
  );

  return createPortal(overlay, document.body) as React.ReactElement;
}

/* ────────────────────────────── stat card ────────────────────────────── */

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "positive" | "neutral";
}) {
  const accent =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "positive"
        ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
        : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-xl border bg-card text-card-foreground p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs sm:text-sm font-medium text-muted-foreground">{label}</span>
        <span
          className={`inline-flex size-7 items-center justify-center rounded-lg ${accent}`}
          aria-hidden
        >
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

/* ────────────────────────────── view toggle ────────────────────────────── */

function ViewToggle({
  view,
  onChange,
}: {
  view: DealsViewMode;
  onChange: (next: DealsViewMode) => void;
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

/* ────────────────────────────── kanban board ────────────────────────────── */

function KanbanBoard({
  stages,
  buckets,
  orphanDeals,
  contactById,
  contactOptions,
  contactLabelSingular,
  activeDragId,
  onDealCreated,
}: {
  stages: StageDef[];
  buckets: Map<string, DealRow[]>;
  orphanDeals: DealRow[];
  contactById: Record<string, string>;
  contactOptions: ContactOption[];
  contactLabelSingular: string;
  activeDragId: string | null;
  onDealCreated: (deal: DealRow) => void;
}) {
  return (
    // The inner flex row drops `min-w-max` (which previously forced
    // the row to be 6 × 300px = 1800px regardless of viewport) so
    // KanbanColumn's `flex-1 min-w-[220px]` can share available
    // space. Wide screens fill comfortably; narrow viewports
    // overflow-x-scroll once the 220px floor is reached.
    <div className="overflow-x-auto p-3 sm:p-4">
      <div className="flex gap-3 sm:gap-4 items-start">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.name}
            stage={stage}
            deals={buckets.get(stage.name) ?? []}
            contactById={contactById}
            contactOptions={contactOptions}
            contactLabelSingular={contactLabelSingular}
            activeDragId={activeDragId}
            onDealCreated={onDealCreated}
          />
        ))}
        {orphanDeals.length > 0 ? (
          <KanbanColumn
            stage={{ name: "Other", color: "#52525b", probability: 0 }}
            deals={orphanDeals}
            contactById={contactById}
            contactOptions={contactOptions}
            contactLabelSingular={contactLabelSingular}
            activeDragId={activeDragId}
            onDealCreated={onDealCreated}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ────────────────────────────── kanban column ────────────────────────────── */

function KanbanColumn({
  stage,
  deals,
  contactById,
  contactOptions,
  contactLabelSingular,
  activeDragId,
  onDealCreated,
}: {
  stage: StageDef;
  deals: DealRow[];
  contactById: Record<string, string>;
  contactOptions: ContactOption[];
  contactLabelSingular: string;
  activeDragId: string | null;
  onDealCreated: (deal: DealRow) => void;
}) {
  const accent = stage.color || fallbackStageAccent(stage.name);
  const isWon = stage.name.toLowerCase().includes("won");
  const isLost = stage.name.toLowerCase().includes("lost");
  const totalValue = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);

  const { setNodeRef, isOver } = useDroppable({
    id: `column:${stage.name}`,
    data: { type: "column", stageName: stage.name },
  });

  const showDropHint = isOver && Boolean(activeDragId);

  return (
    <div
      ref={setNodeRef}
      // flex-1 + min-w-[180px] = columns share available width on
      // wide screens (6 × 180px floor = 1080px). 180px is enough
      // for a 14px deal title + small contact subtitle on one
      // visible line. Outer KanbanBoard's overflow-x-auto only
      // kicks in below ~1080px container width (tablet portrait).
      className={
        "flex min-w-[180px] flex-1 flex-col rounded-xl border transition-colors " +
        (showDropHint
          ? "border-primary/60 bg-primary/5 ring-2 ring-primary/40"
          : isWon
            ? "border-emerald-500/30 bg-emerald-500/5"
            : isLost
              ? "border-border bg-muted/20"
              : "border-border bg-background/50")
      }
    >
      <header
        className={
          "flex items-center justify-between gap-2 border-b px-3 py-2.5 " +
          (isWon
            ? "border-emerald-500/30"
            : isLost
              ? "border-border"
              : "")
        }
        style={!isWon && !isLost ? { borderBottomColor: `${accent}40` } : undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
            <h3
              className={
                "truncate text-sm font-semibold tracking-tight " +
                (isWon
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isLost
                    ? "text-muted-foreground"
                    : "text-foreground")
              }
            >
              {stage.name}
            </h3>
          </div>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {deals.length} · {compactCurrency(totalValue)}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-2 p-2 min-h-[120px]">
        {deals.length === 0 ? (
          <div
            className={
              "rounded-lg border-2 border-dashed py-6 text-center text-[11px] " +
              (showDropHint ? "border-primary/60 text-primary" : "border-border/60 text-muted-foreground")
            }
          >
            Drag deals here
          </div>
        ) : (
          deals.map((deal) => (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              contactName={contactById[deal.contactId] || contactLabelSingular}
              accent={accent}
              isActive={activeDragId === deal.id}
            />
          ))
        )}
      </div>

      <ColumnAddDeal
        stageName={stage.name}
        contactOptions={contactOptions}
        onCreated={onDealCreated}
      />
    </div>
  );
}

/* ────────────────────────────── deal card ────────────────────────────── */

function DraggableDealCard({
  deal,
  contactName,
  accent,
  isActive,
}: {
  deal: DealRow;
  contactName: string;
  accent: string;
  isActive: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: deal.id,
    data: { type: "deal", deal },
  });

  // Hide the original card while dragging — DragOverlay shows the floating one.
  // CSS opacity instead of `display: none` so the layout doesn't reflow.
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isActive ? 0.4 : 1, touchAction: "none" }}
    >
      <DealCardSurface deal={deal} contactName={contactName} accent={accent} />
    </div>
  );
}

function DealCardSurface({
  deal,
  contactName,
  accent,
  isFloating = false,
}: {
  deal: DealRow;
  contactName: string;
  accent: string;
  isFloating?: boolean;
}) {
  const value = Number(deal.value || 0);
  const days = daysSince(deal.updatedAt);

  return (
    <div
      style={{ borderLeftColor: accent }}
      className={
        "rounded-lg border border-border border-l-[3px] bg-card p-3 transition-shadow " +
        // Removed `rotate-1` from the floating overlay — that CSS
        // transform compounded with @dnd-kit's translate3d positioning
        // and made the dragged card visibly drift away from the
        // pointer. Plain shadow-only floating state keeps the
        // overlay aligned to the cursor exactly.
        (isFloating
          ? "shadow-(--shadow-card-hover) cursor-grabbing"
          : "shadow-(--shadow-xs) hover:shadow-(--shadow-card) cursor-grab active:cursor-grabbing")
      }
    >
      {/* Title — Cal Sans is the public renderer's display font;
          dashboard uses Geist Sans semibold which is the closest
          equivalent and matches the rest of the page chrome. */}
      <Link
        href={`/deals/${deal.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        className="block text-sm font-semibold tracking-tight text-foreground line-clamp-2 hover:underline"
      >
        {deal.title}
      </Link>
      <p className="mt-1 truncate text-xs text-muted-foreground">{contactName}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {value > 0 ? fullCurrency(value) : "—"}
        </span>
        {days != null ? (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {days}d
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ────────────────────────── inline create deal ────────────────────────── */

function ColumnAddDeal({
  stageName,
  contactOptions,
  onCreated,
}: {
  stageName: string;
  contactOptions: ContactOption[];
  onCreated: (deal: DealRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState("");
  const [value, setValue] = useState("");
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && titleRef.current) titleRef.current.focus();
  }, [open]);

  function reset() {
    setTitle("");
    setContactId("");
    setValue("");
    setError(null);
    setSubmitting(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await quickCreateDealAction({
      title: title.trim(),
      contactId,
      value: Number(value) || 0,
      stage: stageName,
    });
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    onCreated({
      id: result.dealId,
      title: title.trim(),
      contactId,
      stage: result.stage,
      value: String(Number(value) || 0),
      probability: result.probability,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="m-2 inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <Plus className="size-3.5" />
        Add deal
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="m-2 flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">New {stageName} deal</span>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <input
        ref={titleRef}
        type="text"
        required
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Deal title"
        className="crm-input h-8 px-2 text-xs"
      />
      <select
        required
        value={contactId}
        onChange={(e) => setContactId(e.target.value)}
        className="crm-input h-8 px-2 text-xs"
      >
        <option value="">Pick a contact…</option>
        {contactOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name || "(unnamed)"}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="$ value (optional)"
        className="crm-input h-8 px-2 text-xs"
      />
      {error ? (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="crm-button-primary h-8 px-3 text-xs disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create deal"}
      </button>
    </form>
  );
}

/* ────────────────────────────── table view ────────────────────────────── */

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
              <tr key={deal.id} className="border-b transition-colors hover:bg-muted/30">
                <td className="p-3 align-middle whitespace-nowrap">
                  <Link href={`/deals/${deal.id}`} className="font-semibold hover:underline">
                    {deal.title}
                  </Link>
                </td>
                <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">
                  {contactName}
                </td>
                <td className="p-3 align-middle whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
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
