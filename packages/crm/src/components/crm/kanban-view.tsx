"use client";

import { DndContext, type DragEndEvent, type DragOverEvent, type DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Command, GripVertical } from "lucide-react";
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("rounded-2xl border border-border/80 bg-background/80 p-4 shadow-(--shadow-xs) transition-all", active ? "border-primary/40 shadow-(--shadow-sm)" : "hover:border-border hover:bg-background")}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</p> : null}
        </div>
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(view.cardFields.length > 0 ? view.cardFields : Object.keys(record.values).slice(0, 3)).map((field) => (
          <span key={field} className="rounded-full border border-border/70 bg-card/80 px-2 py-1 text-[11px] text-muted-foreground">
            {resolveFieldLabel(field)}: {formatCrmValue(record.values[field])}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {record.assignee ? (
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10 font-semibold text-primary">
              {record.assignee.avatarFallback || resolveInitials(record.assignee.name)}
            </span>
            {record.assignee.name}
          </div>
        ) : <span />}

        {record.href ? <Link href={record.href} className="text-xs font-medium text-primary hover:underline">Open</Link> : null}
      </div>
    </div>
  );
}

function DroppableLane({
  lane,
  records,
  view,
  activeRecordId,
  hoverLane,
  limit,
}: {
  lane: string;
  records: CrmRecord[];
  view: BlockMdViewDefinition;
  activeRecordId: string | null;
  hoverLane: string | null;
  limit?: number;
}) {
  const { setNodeRef } = useDroppable({ id: lane });
  const overLimit = typeof limit === "number" && records.length > limit;

  return (
    <section ref={setNodeRef} className={cn("flex min-h-[320px] flex-col rounded-[24px] border border-border/80 bg-card/68 p-4 shadow-(--shadow-xs)", hoverLane === lane ? "border-dashed border-primary/40 bg-primary/5" : "") }>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{lane}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{records.length} card{records.length === 1 ? "" : "s"}</p>
        </div>
        {typeof limit === "number" ? (
          <span className={cn("rounded-full border px-2.5 py-1 text-[11px]", overLimit ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-border/80 bg-background/70 text-muted-foreground")}>
            WIP {records.length}/{limit}
          </span>
        ) : null}
      </div>

      {overLimit ? (
        <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200">
          <AlertTriangle className="size-3.5" />
          WIP limit exceeded
        </div>
      ) : null}

      <div className="space-y-3">
        {records.map((record) => (
          <DraggableCard key={record.id} record={record} view={view} active={activeRecordId === record.id} />
        ))}
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
}: {
  view: BlockMdViewDefinition;
  records: CrmRecord[];
  scopedOverride?: CrmScopedOverride;
  endClientMode?: boolean;
  onMoveCard?: (payload: CrmMoveCardPayload) => void;
  className?: string;
}) {
  const { view: resolvedView, laneOrder, editableFields, readOnly } = applyScopedViewOverride(view, scopedOverride);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [hoverLane, setHoverLane] = useState<string | null>(null);
  const [localRecords, setLocalRecords] = useState(records);
  const laneField = resolvedView.laneField ?? "status";
  const draggingEnabled = typeof onMoveCard === "function" && !readOnly && (!endClientMode || editableFields.has(laneField));
  const scopeLabel = endClientMode ? "Client-specific surface" : "Org-wide surface";
  const interactionLabel = draggingEnabled ? "Drag and drop enabled" : readOnly ? "Read-only" : "View only";
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

  return (
    <section className={cn("rounded-[28px] border border-border/80 bg-card/72 p-5 shadow-(--shadow-card)", className)}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-card-title">{resolvedView.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lane-driven pipeline from BLOCK.md metadata with WIP hints and scoped drag/drop behavior.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">{scopeLabel}</span>
            <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">{interactionLabel}</span>
            {savedViewChips.map((savedView) => (
              <span key={`${savedView.visibility}:${savedView.label}`} className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary">
                {savedView.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">Lane field: {laneField}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            onClick={openCommandPalette}
          >
            <Command className="size-3.5" />
            Ctrl/Cmd K
          </button>
        </div>
      </div>

      <div className="mb-5 text-xs text-muted-foreground">
        Tip: open the command palette to jump from pipeline to the deals table or recent CRM records.
      </div>

      {grouped.every((lane) => lane.records.length === 0) ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-background/35 px-5 py-8 text-center">
          <p className="text-sm font-medium text-foreground">This pipeline is ready for its first opportunity.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Create an opportunity from the page actions, then drag it across stages here. You can also use Seldon It to tune the pipeline view.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={openCommandPalette}
            >
              <Command className="size-4" />
              Open command palette
            </button>
          </div>
        </div>
      ) : null}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="grid gap-4 xl:grid-cols-4">
          {grouped.map(({ lane, records: laneRecords }) => (
            <DroppableLane
              key={lane}
              lane={lane}
              records={laneRecords}
              view={resolvedView}
              activeRecordId={activeRecordId}
              hoverLane={hoverLane}
              limit={resolvedView.wipLimits[lane]}
            />
          ))}
        </div>
      </DndContext>
    </section>
  );
}
