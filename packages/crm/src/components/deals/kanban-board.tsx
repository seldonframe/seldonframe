"use client";

import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { motion } from "framer-motion";
import { useMemo, useState, useTransition } from "react";
import { moveDealStageAction } from "@/lib/deals/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

type Stage = { name: string; color: string; probability: number };
type Deal = { id: string; title: string; stage: string; value: string };

export function KanbanBoard({ stages, deals }: { stages: Stage[]; deals: Deal[] }) {
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor));
  const { showDemoToast } = useDemoToast();
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return stages.map((stage) => ({
      stage,
      deals: deals.filter((deal) => deal.stage === stage.name),
    }));
  }, [deals, stages]);

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

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await moveDealStageAction(dealId, target.name, target.probability);
        window.location.reload();
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }

        throw error;
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
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {grouped.map(({ stage, deals: stageDeals }) => (
          <div
            key={stage.name}
            className={`crm-card p-3 ${hoverStage === stage.name ? "border-dashed border-primary bg-[hsl(var(--primary)/0.18)]" : ""}`}
            id={stage.name}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
              <h3 className="text-[14px] font-semibold text-foreground">{stage.name}</h3>
            </div>

            <SortableContext items={stageDeals.map((deal) => deal.id)}>
              <div className="space-y-2 min-h-20">
                {stageDeals.map((deal) => (
                  <motion.div
                    key={deal.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -2, boxShadow: "var(--shadow-card-hover)" }}
                    whileTap={{ y: -4, rotate: 1, boxShadow: "var(--shadow-card-hover)" }}
                    className="rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--color-surface-raised)/0.55)] p-3 transition-all"
                    data-active={activeDealId === deal.id}
                    id={deal.id}
                  >
                    <p className="text-label">{deal.title}</p>
                    <p className="mt-1 text-data text-[hsl(var(--color-text-secondary))]">${Number(deal.value).toLocaleString()}</p>
                  </motion.div>
                ))}
              </div>
            </SortableContext>
          </div>
        ))}
      </div>
      {pending ? <p className="mt-2 text-xs text-[hsl(var(--color-text-secondary))]">Updating stage...</p> : null}
    </DndContext>
  );
}
