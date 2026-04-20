"use client";

import { DndContext, type DragEndEvent, type DragOverEvent, type DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Command, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyScopedViewOverride, formatCrmValue, recordMatchesViewFilters, resolveFieldLabel, resolveInitials, resolveRecordDescription, resolveRecordTitle } from "@/components/crm/utils";
import type { CrmMoveCardPayload, CrmRecord, CrmScopedOverride } from "@/components/crm/types";
import type { BlockMdViewDefinition } from "@/lib/blocks/block-md";

function DraggableCard({ record, view, active }: { record: CrmRecord; view: BlockMdViewDefinition; active: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: record.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.92 : 1,
  };
  const title = resolveRecordTitle(record, view);
  const description = resolveRecordDescription(record, view);
  const chipFields = view.cardFields.length > 0 ? view.cardFields : Object.keys(record.values).slice(0, 3);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/card rounded-xl border border-border/70 bg-background/80 p-3 shadow-(--shadow-xs) transition-all",
        active
          ? "border-primary/50 shadow-(--shadow-sm) ring-1 ring-primary/20"
          : "hover:border-border hover:bg-background hover:shadow-(--shadow-sm)"
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {description ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {/* Grip fades in on hover — the whole card is draggable, the grip is
            just the affordance signal. Less visual noise at rest. */}
        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-60" />
      </div>

      {chipFields.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {chipFields.map((field) => (
            <span
              key={field}
              className="rounded-md border border-border/60 bg-card/60 px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground"
            >
              <span className="text-foreground/70">{resolveFieldLabel(field)}</span>
              <span className="ml-1">{formatCrmValue(record.values[field])}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        {record.assignee ? (
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex size-5 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-[10px] font-semibold text-primary">
              {record.assignee.avatarFallback || resolveInitials(record.assignee.name)}
            </span>
            <span className="truncate">{record.assignee.name}</span>
          </div>
        ) : (
          <span />
        )}
        {record.href ? (
          <Link
            href={record.href}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover/card:opacity-100 focus-visible:opacity-100"
            aria-label="Open record"
          >
            <ChevronRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function formatCompactCurrency(value: number) {
  if (!Number.isFinite(value) || value === 0) return null;
  if (Math.abs(value) >= 1000) {
    const k = value / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${Math.round(value).toLocaleString()}`;
}

function DroppableLane({
  lane,
  records,
  view,
  activeRecordId,
  hoverLane,
  limit,
  color,
  laneValue,
}: {
  lane: string;
  records: CrmRecord[];
  view: BlockMdViewDefinition;
  activeRecordId: string | null;
  hoverLane: string | null;
  limit?: number;
  color?: string;
  laneValue?: number | null;
}) {
  const { setNodeRef } = useDroppable({ id: lane });
  const overLimit = typeof limit === "number" && records.length > limit;
  const valueLabel = typeof laneValue === "number" ? formatCompactCurrency(laneValue) : null;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "relative flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-border/70 bg-card/65 p-3 pt-4 transition-colors",
        hoverLane === lane ? "border-dashed border-primary/50 bg-primary/5" : ""
      )}
    >
      {/* Stage color accent bar — pulled from pipeline schema, falls back to neutral. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ backgroundColor: color || "var(--border)" }}
      />

      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {color ? (
              <span aria-hidden className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            ) : null}
            <h3 className="truncate text-sm font-semibold text-foreground">{lane}</h3>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">{records.length}</span>
          </div>
          {valueLabel ? (
            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{valueLabel}</p>
          ) : null}
        </div>
        {typeof limit === "number" ? (
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums",
              overLimit
                ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                : "border-border/70 bg-background/70 text-muted-foreground"
            )}
          >
            WIP {records.length}/{limit}
          </span>
        ) : null}
      </div>

      {overLimit ? (
        <div className="mb-2 inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200">
          <AlertTriangle className="size-3" />
          WIP limit exceeded
        </div>
      ) : null}

      <div className="space-y-2">
        {records.map((record) => (
          <DraggableCard key={record.id} record={record} view={view} active={activeRecordId === record.id} />
        ))}
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/50 bg-background/20 px-2 py-3 text-center text-[11px] text-muted-foreground">
            Drop a card here
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function KanbanView({
  view,
  records,
  scopedOverride,
  endClientMode = false,
  onMoveCard,
  className,
  laneColors,
  valueField = "value",
}: {
  view: BlockMdViewDefinition;
  records: CrmRecord[];
  scopedOverride?: CrmScopedOverride;
  endClientMode?: boolean;
  onMoveCard?: (payload: CrmMoveCardPayload) => void;
  className?: string;
  // Optional per-lane accent colors keyed by lane name. When omitted lanes use
  // a neutral border. Sourced from the pipeline schema (pipelines.stages.color)
  // so the kanban inherits the same palette the rest of the CRM uses.
  laneColors?: Record<string, string>;
  // Field on `record.values` to sum per lane for the lane-header $ chip.
  // Defaults to "value" (deals); pass null to disable, or a different key for
  // custom-object surfaces.
  valueField?: string | null;
}) {
  const { view: resolvedView, laneOrder, editableFields, readOnly } = applyScopedViewOverride(view, scopedOverride);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [hoverLane, setHoverLane] = useState<string | null>(null);
  const [localRecords, setLocalRecords] = useState(records);
  const laneField = resolvedView.laneField ?? "status";
  const draggingEnabled = typeof onMoveCard === "function" && !readOnly && (!endClientMode || editableFields.has(laneField));
  const savedViewChips = resolvedView.savedViews.slice(0, 2);

  useEffect(() => {
    setLocalRecords(records);
  }, [records]);

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent("crm:command-palette-toggle", { detail: { open: true } }));
  }

  const lanes = useMemo(() => {
    const fromOverrides = laneOrder.filter(Boolean);
    const fromLimits = Object.keys(resolvedView.wipLimits);
    const fromRecords = Array.from(new Set(localRecords.map((record) => String(record.values[laneField] ?? "Backlog")).filter(Boolean)));
    return Array.from(new Set([...fromOverrides, ...fromLimits, ...fromRecords]));
  }, [laneField, laneOrder, localRecords, resolvedView.wipLimits]);

  const grouped = useMemo(
    () => lanes.map((lane) => ({
      lane,
      records: localRecords
        .filter((record) => recordMatchesViewFilters(record, resolvedView.filters))
        .filter((record) => String(record.values[laneField] ?? "Backlog") === lane),
    })),
    [laneField, lanes, localRecords, resolvedView.filters]
  );

  function handleDragStart(event: DragStartEvent) {
    if (!draggingEnabled) return;
    setActiveRecordId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    if (!draggingEnabled) return;
    setHoverLane(event.over ? String(event.over.id) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!draggingEnabled) {
      setActiveRecordId(null);
      setHoverLane(null);
      return;
    }

    const recordId = String(event.active.id);
    const nextLane = event.over?.id ? String(event.over.id) : null;
    if (!nextLane) {
      setActiveRecordId(null);
      setHoverLane(null);
      return;
    }

    const currentRecord = localRecords.find((record) => record.id === recordId);
    const previousLane = String(currentRecord?.values[laneField] ?? "");

    if (!currentRecord || previousLane === nextLane) {
      setActiveRecordId(null);
      setHoverLane(null);
      return;
    }

    setLocalRecords((current) =>
      current.map((record) => (record.id === recordId ? { ...record, values: { ...record.values, [laneField]: nextLane } } : record))
    );
    onMoveCard?.({ recordId, laneField, fromLane: previousLane, toLane: nextLane });
    setActiveRecordId(null);
    setHoverLane(null);
  }

  const totalRecords = grouped.reduce((sum, lane) => sum + lane.records.length, 0);
  const allEmpty = totalRecords === 0;

  return (
    <section className={cn("rounded-2xl border border-border/80 bg-card/60 shadow-(--shadow-xs)", className)}>
      {/* Header — tight, matches TableView. Saved-view chips inline with
          title; no narrator-state chips ("Client-specific surface",
          "Inline edits enabled", "Lane field: status") — those were noise. */}
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-sm font-semibold text-foreground">{resolvedView.name}</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {totalRecords} {totalRecords === 1 ? "card" : "cards"}
          </span>
          {savedViewChips.length > 0 ? (
            <div className="hidden items-center gap-1.5 sm:flex">
              {savedViewChips.map((savedView) => (
                <span
                  key={`${savedView.visibility}:${savedView.label}`}
                  className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                >
                  {savedView.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 self-start rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:self-auto"
          onClick={openCommandPalette}
        >
          <Command className="size-3.5" />
          Cmd K
        </button>
      </div>

      {allEmpty ? (
        <div className="p-6">
          <div className="mx-auto max-w-md rounded-xl border border-dashed border-border/80 bg-background/35 px-5 py-6 text-center">
            <p className="text-sm font-medium text-foreground">Pipeline is ready for its first opportunity.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Create an opportunity from the page actions. Soul It can also generate a tailored pipeline.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={openCommandPalette}
              >
                <Command className="size-3.5" />
                Command palette
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="grid gap-3 p-3 lg:grid-cols-2 xl:grid-cols-4">
          {grouped.map(({ lane, records: laneRecords }) => {
            const laneValue = valueField
              ? laneRecords.reduce((sum, record) => {
                  const raw = record.values[valueField];
                  const num = typeof raw === "number" ? raw : Number(raw);
                  return Number.isFinite(num) ? sum + num : sum;
                }, 0)
              : null;
            return (
              <DroppableLane
                key={lane}
                lane={lane}
                records={laneRecords}
                view={resolvedView}
                activeRecordId={activeRecordId}
                hoverLane={hoverLane}
                limit={resolvedView.wipLimits[lane]}
                color={laneColors?.[lane]}
                laneValue={laneValue}
              />
            );
          })}
        </div>
      </DndContext>
    </section>
  );
}
