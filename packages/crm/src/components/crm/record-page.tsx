"use client";

import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { cn } from "@/lib/utils";
import { applyScopedViewOverride, formatCrmValue, getVisibleFields, resolveFieldLabel, resolveInitials, resolveRecordDescription, resolveRecordTitle } from "@/components/crm/utils";
import type { CrmQuickActionPayload, CrmRecord, CrmScopedOverride } from "@/components/crm/types";
import type { BlockMdViewDefinition } from "@/lib/blocks/block-md";

export function RecordPage({
  view,
  record,
  scopedOverride,
  endClientMode = false,
  onQuickAction,
  className,
}: {
  view: BlockMdViewDefinition;
  record: CrmRecord;
  scopedOverride?: CrmScopedOverride;
  endClientMode?: boolean;
  onQuickAction?: (payload: CrmQuickActionPayload) => void;
  className?: string;
}) {
  const { view: resolvedView, hiddenFields } = applyScopedViewOverride(view, scopedOverride);
  const title = resolveRecordTitle(record, resolvedView);
  const description = resolveRecordDescription(record, resolvedView);
  const visibleFields = getVisibleFields(resolvedView, record, hiddenFields);
  const hiddenActions = new Set(scopedOverride?.hiddenActions ?? []);
  const visibleActions = (record.quickActions ?? []).filter((action) => !hiddenActions.has(action.id));

  return (
    <section className={cn("space-y-4", className)}>
      <div className="rounded-[28px] border border-border/80 bg-card/72 p-6 shadow-(--shadow-card)">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-lg font-semibold text-primary">
              {resolveInitials(title)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-page-title text-foreground">{title}</h1>
                {record.badges?.map((badge) => (
                  <span key={badge} className="crm-badge">{badge}</span>
                ))}
              </div>
              {description ? <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">Entity: {resolvedView.entity}</span>
                <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1">View: {resolvedView.name}</span>
                {endClientMode ? <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-primary">Client-scoped</span> : null}
              </div>
            </div>
          </div>

          {visibleActions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 lg:max-w-[40%] lg:justify-end">
              {visibleActions.map((action) => {
                if (action.href) {
                  return (
                    <Button key={action.id} variant={action.variant ?? "outline"} size="lg" onClick={() => window.open(action.href, "_blank", "noopener,noreferrer")}>
                      <span>
                        {action.label}
                        <ExternalLink className="size-4" />
                      </span>
                    </Button>
                  );
                }

                return (
                  <Button
                    key={action.id}
                    variant={action.variant ?? "outline"}
                    size="lg"
                    disabled={action.disabled || (endClientMode && scopedOverride?.readOnly)}
                    onClick={() => onQuickAction?.({ actionId: action.id, recordId: record.id })}
                  >
                    {action.label}
                    <ArrowUpRight className="size-4" />
                  </Button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-border/80 bg-card/70 p-5 shadow-(--shadow-xs)">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-card-title">Record Details</h2>
                <p className="mt-1 text-sm text-muted-foreground">Fields rendered directly from the BLOCK.md record view metadata.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
              {visibleFields.map((field) => (
                <div key={field} className="contents">
                  <p className="text-sm text-muted-foreground">{resolveFieldLabel(field, scopedOverride, resolvedView.name)}</p>
                  <p className="text-sm leading-6 text-foreground">{formatCrmValue(record.values[field])}</p>
                </div>
              ))}
            </div>
          </section>

          <ActivityTimeline items={record.timeline ?? []} scopedOverride={scopedOverride} endClientMode={endClientMode} />
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border/80 bg-card/70 p-5 shadow-(--shadow-xs)">
            <h2 className="text-card-title">Relationship Preview</h2>
            {record.relationships && record.relationships.length > 0 ? (
              <div className="mt-4 space-y-3">
                {record.relationships.map((relationship) => (
                  <div key={relationship.id} className="rounded-xl border border-border/70 bg-background/55 p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{resolveFieldLabel(relationship.field, scopedOverride, resolvedView.name)}</p>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{relationship.label}</p>
                        {relationship.subtitle ? <p className="mt-1 text-xs text-muted-foreground">{relationship.subtitle}</p> : null}
                        {relationship.badges && relationship.badges.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {relationship.badges.map((badge) => (
                              <span key={badge} className="crm-badge">{badge}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {relationship.href ? (
                        <Link href={relationship.href} className="text-xs font-medium text-primary hover:underline">
                          Open
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-border/80 bg-background/30 px-4 py-6 text-sm text-muted-foreground">
                No related records available for this view yet.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border/80 bg-card/70 p-5 shadow-(--shadow-xs)">
            <h2 className="text-card-title">Linked Records</h2>
            {record.linkedRecordGroups && record.linkedRecordGroups.length > 0 ? (
              <div className="mt-4 space-y-4">
                {record.linkedRecordGroups.map((group) => (
                  <div key={group.id} className="rounded-xl border border-border/70 bg-background/55 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{group.label}</p>
                        {group.subtitle ? <p className="mt-1 text-xs text-muted-foreground">{group.subtitle}</p> : null}
                      </div>
                      <span className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                        {group.records.length} linked
                      </span>
                    </div>

                    <div className="mt-3 space-y-3">
                      {group.records.map((linkedRecord) => (
                        <div key={linkedRecord.id} className="rounded-xl border border-border/70 bg-card/80 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{linkedRecord.label}</p>
                              {linkedRecord.subtitle ? <p className="mt-1 text-xs text-muted-foreground">{linkedRecord.subtitle}</p> : null}
                              {linkedRecord.description ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{linkedRecord.description}</p> : null}
                              {linkedRecord.badges && linkedRecord.badges.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {linkedRecord.badges.map((badge) => (
                                    <span key={badge} className="crm-badge">{badge}</span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {linkedRecord.href ? (
                              <Link href={linkedRecord.href} className="text-xs font-medium text-primary hover:underline">
                                Open
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-border/80 bg-background/30 px-4 py-6 text-sm text-muted-foreground">
                No linked records are pointing at this record yet.
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
