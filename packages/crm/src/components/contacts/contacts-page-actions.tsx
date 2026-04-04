"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, FileInput, Plus } from "lucide-react";

type SortOption = "recent" | "name_asc" | "name_desc" | "score_desc" | "score_asc";
type DateRangeOption = "all" | "month" | "week" | "today";

const dateRanges: Array<{ value: DateRangeOption; label: string }> = [
  { value: "all", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "week", label: "This Week" },
  { value: "today", label: "Today" },
];

function buildHref(params: {
  search: string;
  status: string;
  sort: SortOption;
  dateRange: DateRangeOption;
  exportCsv?: boolean;
}) {
  const query = new URLSearchParams();

  if (params.search) {
    query.set("search", params.search);
  }

  if (params.status && params.status !== "all") {
    query.set("status", params.status);
  }

  if (params.sort && params.sort !== "recent") {
    query.set("sort", params.sort);
  }

  if (params.dateRange && params.dateRange !== "all") {
    query.set("dateRange", params.dateRange);
  }

  if (params.exportCsv) {
    query.set("download", "csv");
  }

  const queryString = query.toString();
  return queryString ? `/contacts?${queryString}` : "/contacts";
}

function exportHref(params: {
  search: string;
  status: string;
  sort: SortOption;
  dateRange: DateRangeOption;
}) {
  const query = new URLSearchParams();

  if (params.search) {
    query.set("search", params.search);
  }

  if (params.status && params.status !== "all") {
    query.set("status", params.status);
  }

  if (params.sort && params.sort !== "recent") {
    query.set("sort", params.sort);
  }

  if (params.dateRange && params.dateRange !== "all") {
    query.set("dateRange", params.dateRange);
  }

  const queryString = query.toString();
  return queryString ? `/contacts/export?${queryString}` : "/contacts/export";
}

export function ContactsPageActions({
  search,
  status,
  sort,
  dateRange,
  mode = "header",
}: {
  search: string;
  status: string;
  sort: SortOption;
  dateRange: DateRangeOption;
  mode?: "header" | "table-import";
}) {
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [importMessage, setImportMessage] = useState(false);

  const currentRangeLabel = useMemo(
    () => dateRanges.find((option) => option.value === dateRange)?.label ?? "All Time",
    [dateRange]
  );

  const exportLink = exportHref({ search, status, sort, dateRange });

  const importItem = (
    <button
      type="button"
      className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
      onClick={() => {
        setImportMessage(true);
        setShowImportMenu(false);
        window.setTimeout(() => setImportMessage(false), 2200);
      }}
    >
      Import CSV
    </button>
  );

  if (mode === "table-import") {
    return (
      <div className="relative">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => setShowImportMenu((current) => !current)}
        >
          <FileInput className="size-4" />
          <span className="hidden sm:inline">Import</span>
        </button>
        {showImportMenu ? (
          <div className="absolute right-0 top-11 z-20 min-w-[160px] rounded-md border border-border bg-card shadow-sm">
            <a href={exportLink} className="block px-3 py-2 text-sm text-foreground hover:bg-accent">
              Export CSV
            </a>
            {importItem}
          </div>
        ) : null}
        {importMessage ? (
          <div className="fixed bottom-4 right-4 z-[70] rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm">Coming soon</div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => setShowDateMenu((current) => !current)}
        >
          <span>{currentRangeLabel}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
        {showDateMenu ? (
          <div className="absolute left-0 top-11 z-20 min-w-[160px] rounded-md border border-border bg-card shadow-sm">
            {dateRanges.map((option) => (
              <Link
                key={option.value}
                href={buildHref({ search, status, sort, dateRange: option.value })}
                className="block px-3 py-2 text-sm text-foreground hover:bg-accent"
                onClick={() => setShowDateMenu(false)}
              >
                {option.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => setShowImportMenu((current) => !current)}
          >
            <span>Import/Export</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
          {showImportMenu ? (
            <div className="absolute right-0 top-11 z-20 min-w-[170px] rounded-md border border-border bg-card shadow-sm">
              <a href={exportLink} className="block px-3 py-2 text-sm text-foreground hover:bg-accent">
                Export CSV
              </a>
              {importItem}
            </div>
          ) : null}
        </div>

        <Link href="/contacts/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm text-background transition-colors hover:bg-foreground/90">
          <Plus className="size-4" />
          <span>Create New</span>
        </Link>
      </div>

      {importMessage ? (
        <div className="fixed bottom-4 right-4 z-[70] rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm">Coming soon</div>
      ) : null}
    </>
  );
}
