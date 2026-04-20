"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpDown, CheckSquare, Command, Pencil, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { applyScopedViewOverride, formatCrmValue, getVisibleColumns, recordMatchesViewFilters, resolveFieldLabel, resolveRecordTitle } from "@/components/crm/utils";
import type { CrmBulkAction, CrmBulkActionPayload, CrmInlineEditPayload, CrmRecord, CrmScopedOverride } from "@/components/crm/types";
import type { BlockMdViewDefinition } from "@/lib/blocks/block-md";

function compareValues(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function TableView({
  view,
  records,
  scopedOverride,
  endClientMode = false,
  bulkActions = [],
  onInlineEdit,
  onBulkAction,
  className,
}: {
  view: BlockMdViewDefinition;
  records: CrmRecord[];
  scopedOverride?: CrmScopedOverride;
  endClientMode?: boolean;
  bulkActions?: CrmBulkAction[];
  onInlineEdit?: (payload: CrmInlineEditPayload) => void;
  onBulkAction?: (payload: CrmBulkActionPayload) => void;
  className?: string;
}) {
  const { view: resolvedView, hiddenFields, editableFields, readOnly } = applyScopedViewOverride(view, scopedOverride);
  const visibleColumns = getVisibleColumns(resolvedView, records, hiddenFields);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(() => Object.fromEntries(resolvedView.filters.map((filter) => [filter.field, filter.value])));
  const [sortField, setSortField] = useState(resolvedView.sorting[0]?.field ?? visibleColumns[0] ?? "");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(resolvedView.sorting[0]?.direction ?? "asc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const filteredRecords = (() => {
    const loweredSearch = search.trim().toLowerCase();
    const nextRecords = records.filter((record) => {
      const matchesSearch = !loweredSearch || visibleColumns.some((field) => String(record.values[field] ?? "").toLowerCase().includes(loweredSearch));
      const matchesFilters = recordMatchesViewFilters(
        record,
        resolvedView.filters.map((filter) => ({
          ...filter,
          value: filters[filter.field] ?? filter.value,
        }))
      );
      return matchesSearch && matchesFilters;
    });

    if (!sortField) {
      return nextRecords;
    }

    return [...nextRecords].sort((left, right) => {
      const result = compareValues(left.values[sortField], right.values[sortField]);
      return sortDirection === "asc" ? result : -result;
    });
  })();

  const allSelected = filteredRecords.length > 0 && filteredRecords.every((record) => selectedIds.includes(record.id));
  const canInlineEdit = !readOnly && (!endClientMode || editableFields.size > 0);
  const hasInlineEdit = typeof onInlineEdit === "function";
  const savedViewChips = resolvedView.savedViews.slice(0, 2);
  const scopeLabel = endClientMode ? "Client-specific surface" : "Org-wide surface";
  const interactionLabel = readOnly ? "Read-only" : hasInlineEdit ? "Inline edits enabled" : "View only";
  const hasAnyRecords = records.length > 0;

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent("crm:command-palette-toggle", { detail: { open: true } }));
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelectedIds(filteredRecords.map((record) => record.id));
      return;
    }
    setSelectedIds([]);
  }

  function toggleRow(recordId: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...new Set([...current, recordId])] : current.filter((id) => id !== recordId)));
  }

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  }

  function handleDraftChange(recordId: string, field: string, value: string) {
    setDrafts((current) => ({ ...current, [`${recordId}:${field}`]: value }));
  }

  function commitEdit(recordId: string, field: string) {
    const key = `${recordId}:${field}`;
    const nextValue = drafts[key];
    if (nextValue == null) {
      return;
    }

    onInlineEdit?.({ recordId, field, value: nextValue });
  }

  return (
    <section className={cn("rounded-[28px] border border-border/80 bg-card/72 p-5 shadow-(--shadow-card)", className)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-card-title">{resolvedView.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Schema-driven table view with sorting, filters, inline edits, and fast navigation.
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 xl:max-w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 rounded-xl border-border/80 bg-background/70 pl-9" placeholder="Search this view" />
          </div>

          <Button type="button" variant="outline" size="lg" onClick={openCommandPalette}>
            <Command className="size-4" />
            Ctrl/Cmd K
          </Button>

          {bulkActions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant ?? "outline"}
              size="lg"
              disabled={selectedIds.length === 0 || (endClientMode && readOnly)}
              onClick={() => onBulkAction?.({ actionId: action.id, recordIds: selectedIds })}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      {resolvedView.filters.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {resolvedView.filters.map((filter) => (
            <Input
              key={filter.field}
              value={filters[filter.field] ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, [filter.field]: event.target.value }))}
              className="h-9 w-[190px] rounded-xl border-border/80 bg-background/60"
              placeholder={`Filter ${resolveFieldLabel(filter.field, scopedOverride, resolvedView.name)}`}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-4 text-xs text-muted-foreground">
        Tip: use the command palette to jump between contacts, deals, and pipeline views without leaving this surface.
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border/80 bg-background/35">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-background/70">
                <th className="w-12 px-3 py-3 text-left">
                  <Checkbox checked={allSelected} onCheckedChange={(checked) => toggleAll(Boolean(checked))} />
                </th>
                {visibleColumns.map((field) => (
                  <th key={field} className="px-3 py-3 text-left align-middle text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <button type="button" className="inline-flex items-center gap-2 text-left hover:text-foreground" onClick={() => handleSort(field)}>
                      {resolveFieldLabel(field, scopedOverride, resolvedView.name)}
                      <ArrowUpDown className="size-3.5" />
                    </button>
                  </th>
                ))}
                <th className="w-24 px-3 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Open</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-border/80 bg-background/35 px-5 py-6 text-left sm:text-center">
                      <p className="text-sm font-medium text-foreground">
                        {hasAnyRecords ? "No records match this view right now." : "This CRM surface is ready for its first record."}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {hasAnyRecords
                          ? "Try clearing the search, adjusting filters, or opening the command palette to jump to another CRM surface."
                          : "Create a record from the page actions or use Seldon It to generate a new CRM view for this workspace."}
                      </p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={openCommandPalette}>
                          <Command className="size-4" />
                          Open command palette
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-border/60 transition-colors hover:bg-background/55">
                    <td className="px-3 py-3 align-top">
                      <Checkbox checked={selectedIds.includes(record.id)} onCheckedChange={(checked) => toggleRow(record.id, Boolean(checked))} />
                    </td>
                    {visibleColumns.map((field) => {
                      const editable = hasInlineEdit && canInlineEdit && (editableFields.size === 0 ? !endClientMode : editableFields.has(field));
                      const draftKey = `${record.id}:${field}`;
                      return (
                        <td key={`${record.id}:${field}`} className="px-3 py-3 align-top">
                          <div className="group/cell flex min-h-9 items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-background/70">
                            {editable ? (
                              <Input
                                value={drafts[draftKey] ?? String(record.values[field] ?? "")}
                                onChange={(event) => handleDraftChange(record.id, field, event.target.value)}
                                onBlur={() => commitEdit(record.id, field)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    commitEdit(record.id, field);
                                  }
                                }}
                                className="h-8 border-transparent bg-transparent px-0 text-sm shadow-none focus-visible:border-border focus-visible:bg-background/70 focus-visible:px-2"
                              />
                            ) : (
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-foreground">{field === resolvedView.titleField ? resolveRecordTitle(record, resolvedView) : formatCrmValue(record.values[field])}</p>
                                {field === resolvedView.titleField && record.subtitle ? <p className="mt-1 truncate text-xs text-muted-foreground">{record.subtitle}</p> : null}
                              </div>
                            )}
                            {editable ? <Pencil className="mt-1 hidden size-3.5 text-muted-foreground group-hover/cell:block" /> : null}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right align-top">
                      {record.href ? (
                        <Link href={record.href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Open
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {selectedIds.includes(record.id) ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
                          Row
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
