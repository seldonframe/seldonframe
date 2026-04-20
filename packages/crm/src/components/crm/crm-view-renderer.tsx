"use client";

import { useMemo } from "react";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { KanbanView } from "@/components/crm/kanban-view";
import { RecordPage } from "@/components/crm/record-page";
import { TableView } from "@/components/crm/table-view";
import { parseBlockMd, type ParsedBlockMd } from "@/lib/blocks/block-md";
import type { CrmBulkAction, CrmBulkActionPayload, CrmInlineEditPayload, CrmMoveCardPayload, CrmQuickActionPayload, CrmRecord, CrmScopedOverride, CrmTimelineItem } from "@/components/crm/types";

export function CrmViewRenderer({
  blockMd,
  parsedBlock,
  viewName,
  route,
  records = [],
  record,
  timeline = [],
  scopedOverride,
  endClientMode = false,
  bulkActions = [],
  onInlineEdit,
  onBulkAction,
  onMoveCard,
  onQuickAction,
  laneColors,
  valueField,
}: {
  blockMd?: string;
  parsedBlock?: ParsedBlockMd;
  viewName?: string;
  route?: string;
  records?: CrmRecord[];
  record?: CrmRecord;
  timeline?: CrmTimelineItem[];
  scopedOverride?: CrmScopedOverride;
  endClientMode?: boolean;
  bulkActions?: CrmBulkAction[];
  onInlineEdit?: (payload: CrmInlineEditPayload) => void;
  onBulkAction?: (payload: CrmBulkActionPayload) => void;
  onMoveCard?: (payload: CrmMoveCardPayload) => void;
  onQuickAction?: (payload: CrmQuickActionPayload) => void;
  // Forwarded to KanbanView when the resolved view is a kanban. Ignored for
  // table/record/timeline views.
  laneColors?: Record<string, string>;
  valueField?: string | null;
}) {
  const resolvedBlock = useMemo(() => parsedBlock ?? (blockMd ? parseBlockMd(blockMd) : null), [blockMd, parsedBlock]);
  const resolvedView = resolvedBlock?.views.find((candidate) => (viewName ? candidate.name === viewName : route ? candidate.route === route : false)) ?? resolvedBlock?.views[0] ?? null;

  if (!resolvedView) {
    return null;
  }

  if (resolvedView.type === "table") {
    return (
      <TableView
        view={resolvedView}
        records={records}
        scopedOverride={scopedOverride}
        endClientMode={endClientMode}
        bulkActions={bulkActions}
        onInlineEdit={onInlineEdit}
        onBulkAction={onBulkAction}
      />
    );
  }

  if (resolvedView.type === "kanban") {
    return (
      <KanbanView
        view={resolvedView}
        records={records}
        scopedOverride={scopedOverride}
        endClientMode={endClientMode}
        onMoveCard={onMoveCard}
        laneColors={laneColors}
        valueField={valueField}
      />
    );
  }

  if (resolvedView.type === "record" && record) {
    return <RecordPage view={resolvedView} record={record} scopedOverride={scopedOverride} endClientMode={endClientMode} onQuickAction={onQuickAction} />;
  }

  if (resolvedView.type === "timeline") {
    return <ActivityTimeline items={timeline.length > 0 ? timeline : record?.timeline ?? []} scopedOverride={scopedOverride} endClientMode={endClientMode} />;
  }

  return null;
}
