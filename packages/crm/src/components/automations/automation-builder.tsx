"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EventType } from "@seldonframe/core/events";

type NodeKind = "trigger" | "condition" | "action";

type FlowNode = {
  id: string;
  kind: NodeKind;
  value: string;
};

const triggerOptions: EventType[] = [
  "contact.created",
  "contact.updated",
  "deal.stage_changed",
  "form.submitted",
  "booking.created",
  "booking.completed",
  "booking.cancelled",
  "booking.no_show",
  "email.sent",
  "email.opened",
  "email.clicked",
  "landing.visited",
  "landing.converted",
  "payment.completed",
  "payment.failed",
  "subscription.created",
  "subscription.cancelled",
  "invoice.created",
  "portal.login",
  "portal.message_sent",
  "portal.resource_viewed",
];

const conditionOptions = [
  "Contact field matches",
  "Deal value greater than",
  "Deal stage equals",
  "X days after event",
  "X days before renewal",
  "Contact status equals",
];

const actionOptions = [
  "Send email",
  "Create task",
  "Move deal stage",
  "Assign contact",
  "Send notification",
  "Update field",
  "Trigger webhook",
];

const templateOptions = [
  "Lead follow-up after form submission",
  "No-show recovery campaign",
  "Deal won onboarding sequence",
  "Churn risk intervention",
];

const sampleRunHistory = [
  { id: "run_1", template: "Lead follow-up after form submission", target: "sarah.chen@example.com", status: "success", at: "2 min ago" },
  { id: "run_2", template: "No-show recovery campaign", target: "marcus.j@example.com", status: "success", at: "19 min ago" },
  { id: "run_3", template: "Churn risk intervention", target: "olivia.m@example.com", status: "failed", at: "1 h ago" },
];

function NodeCard({ node }: { node: FlowNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const accent = node.kind === "trigger" ? "text-indigo-600" : node.kind === "condition" ? "text-amber-600" : "text-emerald-600";

  return (
    <article ref={setNodeRef} style={style} className="crm-table-row rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.08em] ${accent}`}>{node.kind}</p>
          <p className="mt-1 text-sm font-medium text-foreground">{node.value}</p>
        </div>
        <button
          type="button"
          className="rounded border border-[hsl(var(--border))] px-2 py-1 text-xs text-[hsl(var(--color-text-secondary))]"
          {...attributes}
          {...listeners}
        >
          Drag
        </button>
      </div>
    </article>
  );
}

export function AutomationBuilder() {
  const [name, setName] = useState("New Automation");
  const [nodes, setNodes] = useState<FlowNode[]>([
    { id: "node-trigger", kind: "trigger", value: "form.submitted" },
    { id: "node-condition", kind: "condition", value: "Contact field matches" },
    { id: "node-action", kind: "action", value: "Send email" },
  ]);

  const sensors = useSensors(useSensor(PointerSensor));

  const ids = useMemo(() => nodes.map((node) => node.id), [nodes]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = nodes.findIndex((node) => node.id === active.id);
    const newIndex = nodes.findIndex((node) => node.id === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    setNodes((current) => arrayMove(current, oldIndex, newIndex));
  }

  function addNode(kind: NodeKind, value: string) {
    setNodes((current) => [...current, { id: `${kind}-${Date.now()}-${Math.random()}`, kind, value }]);
  }

  function saveTemplate() {
    window.alert("Template saved (foundation mode). Persistence wiring can be added next.");
  }

  return (
    <section className="space-y-4">
      <div className="crm-card grid gap-3 p-4 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div>
          <label className="text-label text-[hsl(var(--color-text-secondary))]" htmlFor="automation-name">
            Automation Name
          </label>
          <input
            id="automation-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="crm-input mt-1 h-10 w-full px-3"
          />
        </div>
        <button type="button" className="crm-button-primary h-10 px-4" onClick={saveTemplate}>
          Save Template
        </button>
        <button type="button" className="h-10 rounded-md border border-[hsl(var(--border))] px-4 text-sm font-medium">
          Run Test
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr_340px]">
        <aside className="crm-card space-y-4">
          <h3 className="text-card-title">Node Library</h3>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-indigo-600">Triggers</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {triggerOptions.map((item) => (
                <button key={item} type="button" onClick={() => addNode("trigger", item)} className="rounded border px-2 py-1 text-xs">
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-600">Conditions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {conditionOptions.map((item) => (
                <button key={item} type="button" onClick={() => addNode("condition", item)} className="rounded border px-2 py-1 text-xs">
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-600">Actions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {actionOptions.map((item) => (
                <button key={item} type="button" onClick={() => addNode("action", item)} className="rounded border px-2 py-1 text-xs">
                  {item}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="crm-card">
          <h3 className="mb-3 text-card-title">Visual Flow Builder</h3>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {nodes.map((node) => (
                  <NodeCard key={node.id} node={node} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <aside className="space-y-4">
          <article className="crm-card">
            <h3 className="text-card-title">Templates</h3>
            <ul className="mt-3 space-y-2">
              {templateOptions.map((template) => (
                <li key={template} className="crm-table-row rounded-md px-2 py-2 text-sm">
                  {template}
                </li>
              ))}
            </ul>
          </article>

          <article className="crm-card">
            <h3 className="text-card-title">Automation Run History</h3>
            <ul className="mt-3 space-y-2">
              {sampleRunHistory.map((run) => (
                <li key={run.id} className="crm-table-row rounded-md px-2 py-2 text-sm">
                  <p className="font-medium text-foreground">{run.template}</p>
                  <p className="text-[hsl(var(--color-text-secondary))]">{run.target}</p>
                  <p className="text-xs text-[hsl(var(--color-text-muted))]">
                    {run.status} • {run.at}
                  </p>
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </div>
    </section>
  );
}
