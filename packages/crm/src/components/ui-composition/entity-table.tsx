// <EntityTable> — tabular list primitive that auto-derives columns
// from a Zod schema. The core list-data pattern for SLICE 4a admin
// surfaces. Shipped per audit §2.1.
//
// Scope for v1:
//   - Auto column derivation from ZodObject shape (see
//     lib/ui/derive-columns.ts).
//   - Override API: include (ordered subset) + per-key overrides
//     (title / hidden / renderer).
//   - Empty-state slot with sensible default copy.
//   - Type-aware default cell renderers: boolean → Yes/No,
//     null/undefined → em-dash, primitives → String(value).
//   - A11y: aria-label + scope="col" on headers.
//
// NOT in v1 (future):
//   - Client-side sorting (add in follow-up; requires hook + icon).
//   - Pagination (requires more state).
//   - Global search (requires Input + filter state).
//   - Row-select / bulk actions.
//   - Virtualized rendering for >1000 rows.
//
// Server component — renders static HTML. Client-side interaction
// (sort, filter) will add `"use client"` + state hooks in follow-up.

import type { ReactNode } from "react";
import type { ZodObject, ZodTypeAny } from "zod";

import {
  deriveColumns,
  type Column,
  type DeriveColumnsOptions,
} from "@/lib/ui/derive-columns";

export type EntityTableProps<T extends Record<string, unknown>> = {
  schema: ZodObject<Record<string, ZodTypeAny>>;
  rows: T[];
  /** Optional include + overrides forwarded to deriveColumns. */
  columns?: DeriveColumnsOptions<T>;
  /** Overrides the default "No records" empty state. */
  emptyState?: ReactNode;
  /** Accessible name for screen readers. */
  ariaLabel?: string;
};

export function EntityTable<T extends Record<string, unknown>>({
  schema,
  rows,
  columns,
  emptyState,
  ariaLabel,
}: EntityTableProps<T>) {
  const cols = deriveColumns<T>(schema, columns);

  if (rows.length === 0) {
    return (
      <div
        data-entity-table-empty=""
        className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border bg-card/30 p-8 text-body text-muted-foreground"
      >
        {emptyState ?? "No records yet."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <table
        aria-label={ariaLabel}
        className="w-full border-collapse text-body"
      >
        <thead className="bg-muted/40">
          <tr>
            {cols.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="px-4 py-3 text-left text-label text-muted-foreground font-medium"
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-t border-border transition-colors duration-fast hover:bg-muted/30"
            >
              {cols.map((col) => (
                <td key={col.key} className="px-4 py-3 text-foreground">
                  {renderCell(col, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------
// Default cell renderer
// ---------------------------------------------------------------------

function renderCell<T extends Record<string, unknown>>(
  col: Column<T>,
  row: T,
): ReactNode {
  const value = row[col.key];
  if (col.renderer) return col.renderer(value, row);
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return <code className="text-tiny">{JSON.stringify(value)}</code>;
  return String(value);
}
