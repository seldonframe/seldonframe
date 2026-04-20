import type { CrmRecord, CrmTimelineItem } from "@/components/crm/types";

export function mapActivitiesToTimelineItems(
  items: Array<{ id: string; type: string; subject: string | null; body: string | null; createdAt: Date | string; completedAt?: Date | string | null }>
): CrmTimelineItem[] {
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.subject?.trim() || "Activity",
    body: item.body?.trim() || undefined,
    occurredAt: new Date(item.completedAt ?? item.createdAt).toISOString(),
    status: item.completedAt ? "Completed" : undefined,
  }));
}

export function mapContactRowToCrmRecord(input: {
  row: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    company?: string | null;
    status: string;
    score?: number;
    title?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    tags?: string[];
  };
  badges?: string[];
  href?: string;
  revenue?: number;
  openTaskCount?: number;
  timeline?: CrmTimelineItem[];
  relationships?: CrmRecord["relationships"];
  linkedRecordGroups?: CrmRecord["linkedRecordGroups"];
  quickActions?: CrmRecord["quickActions"];
}) {
  const { row } = input;
  const fullName = `${row.firstName} ${row.lastName ?? ""}`.trim() || row.firstName;

  return {
    id: row.id,
    href: input.href,
    title: fullName,
    subtitle: row.company ?? row.title ?? undefined,
    badges: input.badges ?? row.tags ?? [],
    quickActions: input.quickActions,
    relationships: input.relationships,
    linkedRecordGroups: input.linkedRecordGroups,
    timeline: input.timeline,
    values: {
      name: fullName,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      company: row.company ?? null,
      title: row.title ?? null,
      status: row.status,
      score: row.score ?? 0,
      revenue: input.revenue ?? 0,
      openTaskCount: input.openTaskCount ?? 0,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    },
  } satisfies CrmRecord;
}

export function mapDealRowToCrmRecord(input: {
  row: {
    id: string;
    title: string;
    stage: string;
    value: string | number;
    probability: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    closedAt?: Date | string | null;
    notes?: string | null;
  };
  contactName?: string;
  assigneeName?: string | null;
  href?: string;
  timeline?: CrmTimelineItem[];
  relationships?: CrmRecord["relationships"];
  linkedRecordGroups?: CrmRecord["linkedRecordGroups"];
  quickActions?: CrmRecord["quickActions"];
}) {
  const { row } = input;

  return {
    id: row.id,
    href: input.href,
    title: row.title,
    subtitle: input.contactName || undefined,
    quickActions: input.quickActions,
    relationships: input.relationships,
    linkedRecordGroups: input.linkedRecordGroups,
    timeline: input.timeline,
    assignee: input.assigneeName
      ? {
          name: input.assigneeName,
        }
      : null,
    values: {
      title: row.title,
      contactName: input.contactName ?? "Unassigned contact",
      stage: row.stage,
      value: Number(row.value),
      probability: row.probability,
      notes: row.notes ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      closedAt: row.closedAt ? new Date(row.closedAt).toISOString() : null,
    },
  } satisfies CrmRecord;
}
