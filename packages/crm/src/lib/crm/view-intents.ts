import type { BlockMdViewType } from "@/lib/blocks/block-md";
import type { CrmSurfaceEntity } from "@/lib/crm/view-config";

export type CrmViewIntent = {
  entity: CrmSurfaceEntity;
  viewType: BlockMdViewType;
  adminPath: string;
  label: string;
};

export type CrmBrainIntent = {
  entities: CrmSurfaceEntity[];
};

function inferViewType(normalized: string): BlockMdViewType | null {
  if (/(kanban|pipeline|board|column view|stage board)/.test(normalized)) {
    return "kanban";
  }

  if (/(table|list view|list|spreadsheet|grid|rows?)/.test(normalized)) {
    return "table";
  }

  if (/(timeline|activity history|activity stream|activity log|history)/.test(normalized)) {
    return "timeline";
  }

  if (/(record view|detail view|record page|detail page|profile|details panel|show .*record)/.test(normalized)) {
    return "record";
  }

  return null;
}

function inferEntities(normalized: string, viewType: BlockMdViewType): CrmSurfaceEntity[] {
  if (/(contact|contacts|people|lead|leads|prospect|prospects|client|clients)/.test(normalized)) {
    return ["contacts"];
  }

  if (/(deal|deals|opportunit|opportunities|pipeline|pipelines|engagement|engagements|sales)/.test(normalized)) {
    return ["deals"];
  }

  if (viewType === "kanban") {
    return ["deals"];
  }

  if (viewType === "timeline" || normalized.includes("this record")) {
    return ["contacts", "deals"];
  }

  return ["contacts"];
}

function buildLabel(entity: CrmSurfaceEntity, viewType: BlockMdViewType) {
  if (entity === "contacts") {
    if (viewType === "table") return "Contacts Table";
    if (viewType === "timeline") return "Contact Timeline";
    if (viewType === "record") return "Contact Record";
    return "Contacts Surface";
  }

  if (viewType === "kanban") return "Opportunities Pipeline";
  if (viewType === "table") return "Opportunities Table";
  if (viewType === "timeline") return "Opportunity Timeline";
  if (viewType === "record") return "Opportunity Record";
  return "Opportunities Surface";
}

function buildAdminPath(entity: CrmSurfaceEntity, viewType: BlockMdViewType) {
  if (entity === "contacts") {
    return "/contacts";
  }

  if (viewType === "kanban") {
    return "/deals/pipeline";
  }

  return "/deals";
}

export function extractCrmViewIntents(input: string) {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return [] as CrmViewIntent[];
  }

  const viewType = inferViewType(normalized);
  if (!viewType) {
    return [] as CrmViewIntent[];
  }

  const verbsMatch = /\b(add|create|build|show|enable|make|turn on|set up|give me|i need|i want|we need|we want|can you add|let's build|let's make)\b/.test(normalized);
  if (!verbsMatch) {
    return [] as CrmViewIntent[];
  }

  return Array.from(new Set(inferEntities(normalized, viewType))).map((entity) => ({
    entity,
    viewType,
    adminPath: buildAdminPath(entity, viewType),
    label: buildLabel(entity, viewType),
  }));
}

export function extractCrmBrainIntents(input: string): CrmBrainIntent[] {
  const normalized = input.trim().toLowerCase();
  if (!normalized || !/(brain insights?|brain summary|intelligence summary|intelligence section)/.test(normalized)) {
    return [] as CrmBrainIntent[];
  }

  if (/(deal|deals|opportunit|opportunities|pipeline)/.test(normalized)) {
    return [{ entities: ["deals"] }];
  }

  if (/(contact|contacts|people|client|clients|lead|leads)/.test(normalized)) {
    return [{ entities: ["contacts"] }];
  }

  if (/(record pages?|record view|detail pages?|all records?|crm records?)/.test(normalized)) {
    return [{ entities: ["contacts", "deals"] }];
  }

  return [] as CrmBrainIntent[];
}
