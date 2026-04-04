"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { useMemo, useState, useTransition } from "react";
import { moveDealStageAction } from "@/lib/deals/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

type Stage = { name: string; color: string; probability: number };
type Deal = { id: string; title: string; stage: string; value: string };

function DraggableDealCard({ deal, active }: { deal: Deal; active: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.9 : 1,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, boxShadow: "var(--shadow-card-hover)" }}
      whileTap={{ y: -3, boxShadow: "var(--shadow-card-hover)" }}
      className="rounded-lg border border-border bg-card p-3 transition-all"
      data-active={active}
      {...attributes}
      {...listeners}
    >
      <p className="text-sm font-medium text-foreground">{deal.title}</p>
      <p className="mt-1 text-xs text-[hsl(var(--color-text-secondary))]">${Number(deal.value).toLocaleString()}</p>
    </motion.div>
  );
}

function DroppableStageColumn({
  stage,
  stageDeals,
  activeDealId,
  hoverStage,
}: {
  stage: Stage;
  stageDeals: Deal[];
  activeDealId: string | null;
  hoverStage: string | null;
}) {
  const { setNodeRef } = useDroppable({ id: stage.name });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border bg-card p-3 ${hoverStage === stage.name ? "border-dashed border-primary bg-[hsl(var(--primary)/0.12)]" : ""}`}
      id={stage.name}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
        <h3 className="text-[14px] font-semibold text-foreground">{stage.name}</h3>
      </div>

      <div className="min-h-20 space-y-2">
        {stageDeals.map((deal) => (
          <DraggableDealCard key={deal.id} deal={deal} active={activeDealId === deal.id} />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({ stages, deals }: { stages: Stage[]; deals: Deal[] }) {
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor));
  const { showDemoToast } = useDemoToast();
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);
  const [localDeals, setLocalDeals] = useState(deals);

  const grouped = useMemo(() => {
    return stages.map((stage) => ({
      stage,
      deals: localDeals.filter((deal) => deal.stage === stage.name),
    }));
  }, [localDeals, stages]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDealId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    setHoverStage(event.over ? String(event.over.id) : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const dealId = String(event.active.id);
    const overId = event.over?.id;

    if (!overId) {
      return;
    }

    const stageName = String(overId);
    const target = stages.find((stage) => stage.name === stageName);

    if (!target) {
      return;
    }

    const movingDeal = localDeals.find((deal) => deal.id === dealId);

    if (!movingDeal || movingDeal.stage === target.name) {
      setActiveDealId(null);
      setHoverStage(null);
      return;
    }

    const previousStage = movingDeal.stage;

    setLocalDeals((current) => current.map((deal) => (deal.id === dealId ? { ...deal, stage: target.name } : deal)));

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await moveDealStageAction(dealId, target.name, target.probability);
      } catch (error) {
        if (isDemoBlockedError(error)) {
          setLocalDeals((current) => current.map((deal) => (deal.id === dealId ? { ...deal, stage: previousStage } : deal)));
          showDemoToast();
          return;
        }

        setLocalDeals((current) => current.map((deal) => (deal.id === dealId ? { ...deal, stage: previousStage } : deal)));
      }
    });

    setActiveDealId(null);
    setHoverStage(null);
  };

  const handleDragCancel = () => {
    setActiveDealId(null);
    setHoverStage(null);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="grid gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        {grouped.map(({ stage, deals: stageDeals }) => (
          <DroppableStageColumn
            key={stage.name}
            stage={stage}
            stageDeals={stageDeals}
            activeDealId={activeDealId}
            hoverStage={hoverStage}
          />
        ))}
      </div>
      {pending ? <p className="mt-2 text-xs text-[hsl(var(--color-text-secondary))]">Updating stage...</p> : null}
    </DndContext>
  );
}
