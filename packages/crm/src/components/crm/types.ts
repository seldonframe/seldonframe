import type { BlockMdViewDefinition } from "@/lib/blocks/block-md";

export type CrmActionVariant = "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";

export type CrmQuickAction = {
  id: string;
  label: string;
  href?: string;
  variant?: CrmActionVariant;
  disabled?: boolean;
};

export type CrmBulkAction = {
  id: string;
  label: string;
  variant?: CrmActionVariant;
};

export type CrmAssignee = {
  name: string;
  email?: string | null;
  avatarFallback?: string;
};

export type CrmRelationshipPreview = {
  id: string;
  field: string;
  label: string;
  href?: string;
  subtitle?: string;
  badges?: string[];
};

export type CrmLinkedRecord = {
  id: string;
  label: string;
  href?: string;
  subtitle?: string;
  description?: string;
  badges?: string[];
};

export type CrmLinkedRecordGroup = {
  id: string;
  label: string;
  subtitle?: string;
  field: string;
  target: string;
  records: CrmLinkedRecord[];
};

export type CrmTimelineItem = {
  id: string;
  type: string;
  title: string;
  body?: string;
  occurredAt: string;
  actor?: string;
  href?: string;
  status?: string;
  details?: Record<string, unknown>;
};

export type CrmRecord = {
  id: string;
  href?: string;
  title?: string;
  subtitle?: string;
  values: Record<string, unknown>;
  assignee?: CrmAssignee | null;
  badges?: string[];
  quickActions?: CrmQuickAction[];
  relationships?: CrmRelationshipPreview[];
  linkedRecordGroups?: CrmLinkedRecordGroup[];
  timeline?: CrmTimelineItem[];
};

export type CrmViewOverride = Partial<
  Pick<
    BlockMdViewDefinition,
    | "columns"
    | "fields"
    | "cardFields"
    | "filters"
    | "sorting"
    | "laneField"
    | "titleField"
    | "descriptionField"
    | "wipLimits"
    | "savedViews"
    | "route"
    | "default"
  >
> & {
  hiddenFields?: string[];
  editableFields?: string[];
  laneOrder?: string[];
  labelOverrides?: Record<string, string>;
};

export type CrmScopedOverride = {
  readOnly?: boolean;
  hiddenFields?: string[];
  editableFields?: string[];
  hiddenActions?: string[];
  labelOverrides?: Record<string, string>;
  laneOrder?: string[];
  viewOverrides?: Record<string, CrmViewOverride>;
};

export type CrmInlineEditPayload = {
  recordId: string;
  field: string;
  value: unknown;
};

export type CrmBulkActionPayload = {
  actionId: string;
  recordIds: string[];
};

export type CrmMoveCardPayload = {
  recordId: string;
  laneField: string;
  fromLane: string;
  toLane: string;
};

export type CrmQuickActionPayload = {
  actionId: string;
  recordId: string;
};
