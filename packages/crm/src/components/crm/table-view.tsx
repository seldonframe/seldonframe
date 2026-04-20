"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Command, Pencil, Search } from "lucide-react";
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
  const [sortField, setSortField] = useState(resolvedView.sorting[0]?.field ?? "");
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
  const someSelected = selectedIds.length > 0 && !allSelected;
  const canInlineEdit = !readOnly && (!endClientMode || editableFields.size > 0);
  const hasInlineEdit = typeof onInlineEdit === "function";
  const savedViewChips = resolvedView.savedViews.slice(0, 2);
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

  function cancelEdit(recordId: string, field: string) {
    const key = `${recordId}:${field}`;
    setDrafts((current) => {
      if (!(key in current)) return current;
      const { [key]: _omit, ...rest } = current;
      void _omit;
      return rest;
    });
  }

  return (
    <section className={cn("rounded-2xl border border-border/80 bg-card/60 shadow-(--shadow-xs)", className)}>
      {/* Top bar — search + saved views + actions. Kept compact; header chrome
          should never feel heavier than the data. */}
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-sm font-semibold text-foreground">{resolvedView.name}</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {filteredRecords.length}
            {filteredRecords.length !== records.length ? ` of ${records.length}` : ""}
          </span>
          {savedViewChips.length > 0 ? (
            <div className="hidden items-center gap-1.5 sm:flex">
              {savedViewChips.map((savedView) => (
                <span
                  key={`${savedView.visibility}:${savedView.label}`}
                  className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                >
                  {savedView.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 lg:max-w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 rounded-lg border-border/80 bg-background/70 pl-8 text-sm"
              placeholder="Search"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openCommandPalette}
            className="h-8 text-xs"
          >
            <Command className="size-3.5" />
            Cmd K
          </Button>

          {bulkActions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant ?? "outline"}
              size="sm"
              className="h-8 text-xs"
              disabled={selectedIds.length === 0 || (endClientMode && readOnly)}
              onClick={() => onBulkAction?.({ actionId: action.id, recordIds: selectedIds })}
            >
              {action.label}
              {selectedIds.length > 0 ? (
                <span className="ml-1 rounded-full bg-primary/20 px-1.5 text-[10px] tabular-nums">
                  {selectedIds.length}
                </span>
              ) : null}
            </Button>
          ))}
        </div>
      </div>

      {resolvedView.filters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-background/30 px-4 py-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Filter</span>
          {resolvedView.filters.map((filter) => (
            <Input
              key={filter.field}
              value={filters[filter.field] ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, [filter.field]: event.target.value }))}
              className="h-7 w-[160px] rounded-md border-border/80 bg-background/70 text-xs"
              placeholder={resolveFieldLabel(filter.field, scopedOverride, resolvedView.name)}
            />
          ))}
        </div>
      ) : null}

      {/* Table — edge to edge, tight rows (~36px), sticky header, hover
          affordance on row + on editable cell. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-border/70 bg-card/95 backdrop-blur">
              <th className="w-10 px-3 py-2.5 text-left">
                <Checkbox
                  checked={allSelected}
                  // Indeterminate styling when partial selection — gives a
                  // visual hint that "select all" is a toggle.
                  data-state={someSelected ? "indeterminate" : undefined}
                  onCheckedChange={(checked) => toggleAll(Boolean(checked))}
                />
              </th>
              {visibleColumns.map((field) => {
                const isSortField = sortField === field;
                return (
                  <th
                    key={field}
                    scope="col"
                    className="group/col whitespace-nowrap px-3 py-2.5 text-left align-middle text-xs font-medium text-muted-foreground"
                  >
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1.5 text-left transition-colors",
                        isSortField ? "text-foreground" : "hover:text-foreground"
                      )}
                      onClick={() => handleSort(field)}
                    >
                      {resolveFieldLabel(field, scopedOverride, resolvedView.name)}
                      {isSortField ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-0 transition-opacity group-hover/col:opacity-60" />
                      )}
                    </button>
                  </th>
                );
              })}
              <th className="w-10 px-3 py-2.5 text-right text-xs text-muted-foreground" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 2} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  <div className="mx-auto max-w-md rounded-xl border border-dashed border-border/80 bg-background/35 px-5 py-6 text-left sm:text-center">
                    <p className="text-sm font-medium text-foreground">
                      {hasAnyRecords ? "No records match this view." : "This surface is ready for its first record."}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {hasAnyRecords
                        ? "Try clearing the search or adjusting filters."
                        : "Create a record from the page actions, or open the command palette to jump elsewhere."}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={openCommandPalette}>
                        <Command className="size-3.5" />
                        Command palette
                      </Button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => {
                const isSelected = selectedIds.includes(record.id);
                return (
                  <tr
                    key={record.id}
                    className={cn(
                      "group/row relative border-b border-border/50 transition-colors",
                      isSelected ? "bg-primary/5 hover:bg-primary/8" : "hover:bg-accent/30"
                    )}
                  >
                    {/* Left selection accent when row is picked — subtle 2px bar. */}
                    {isSelected ? (
                      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                    ) : null}
                    <td className="w-10 px-3 py-2 align-middle">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => toggleRow(record.id, Boolean(checked))}
                      />
                    </td>
                    {visibleColumns.map((field) => {
                      const editable = hasInlineEdit && canInlineEdit && (editableFields.size === 0 ? !endClientMode : editableFields.has(field));
                      const draftKey = `${record.id}:${field}`;
                      const isTitleField = field === resolvedView.titleField;
                      return (
                        <td key={`${record.id}:${field}`} className="px-3 py-1.5 align-middle">
                          <div
                            className={cn(
                              "group/cell flex min-h-8 items-center gap-2 rounded-md px-2 py-1 transition",
                              editable ? "hover:bg-background/80 hover:ring-1 hover:ring-inset hover:ring-border/80" : ""
                            )}
                          >
                            {editable ? (
                              <>
                                <Input
                                  value={drafts[draftKey] ?? String(record.values[field] ?? "")}
                                  onChange={(event) => handleDraftChange(record.id, field, event.target.value)}
                                  onBlur={() => commitEdit(record.id, field)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      commitEdit(record.id, field);
                                      (event.currentTarget as HTMLInputElement).blur();
                                    } else if (event.key === "Escape") {
                                      event.preventDefault();
                                      cancelEdit(record.id, field);
                                      (event.currentTarget as HTMLInputElement).blur();
                                    }
                                  }}
                                  className="h-7 border-transparent bg-transparent px-0 text-sm shadow-none focus-visible:border-border/80 focus-visible:bg-background focus-visible:px-2 focus-visible:ring-1 focus-visible:ring-primary/40"
                                />
                                <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-50" />
                              </>
                            ) : (
                              <div className="min-w-0 flex-1">
                                <p className={cn("truncate text-sm", isTitleField ? "font-medium text-foreground" : "text-foreground")}>
                                  {isTitleField ? resolveRecordTitle(record, resolvedView) : formatCrmValue(record.values[field])}
                                </p>
                                {isTitleField && record.subtitle ? (
                                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{record.subtitle}</p>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="w-10 px-3 py-1.5 text-right align-middle">
                      {record.href ? (
                        <Link
                          href={record.href}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background/80 hover:text-foreground group-hover/row:opacity-100 focus-visible:opacity-100"
                          aria-label="Open record"
                        >
                          <ChevronRight className="size-4" />
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
