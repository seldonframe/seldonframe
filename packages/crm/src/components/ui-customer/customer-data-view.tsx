// <CustomerDataView> — themed data display for read-only customer
// contexts. Customer-facing analog of 4a's <EntityTable> +
// <CompositionCard>, but styled with --sf-* tokens (PublicTheme
// namespace) and card-first by default.
//
// Shipped in SLICE 4b PR 1 C2 per audit §5.2.
//
// Why card-first: tables feel utilitarian (good for admin dense
// data); cards feel branded (good for customer-facing surfaces
// where each row is "one of your bookings" / "one of your
// submissions"). Customers benefit from negative space and
// visual rhythm. layout="table" remains for power-user contexts
// (admin reviewing customer data, dashboards with many rows).
//
// Pure composition (L-17 0.94x). Parent owns data fetching;
// component owns rendering, layout switching, empty state.

import type { ReactNode } from "react";
import type { ZodObject, ZodTypeAny } from "zod";

import { deriveColumns, type Column } from "@/lib/ui/derive-columns";

export type CustomerDataViewProps<T extends Record<string, unknown>> = {
  schema: ZodObject<Record<string, ZodTypeAny>>;
  rows: T[];
  /** Default "cards" — card-first for customer surfaces. */
  layout?: "cards" | "table";
  /** Optional ordered subset of schema keys to render. */
  fields?: (keyof T & string)[];
  /** Override the default empty-state copy. */
  emptyState?: ReactNode;
  /** Accessible name for screen readers. */
  ariaLabel?: string;
};

export function CustomerDataView<T extends Record<string, unknown>>({
  schema,
  rows,
  layout = "cards",
  fields,
  emptyState,
  ariaLabel,
}: CustomerDataViewProps<T>) {
  if (rows.length === 0) {
    return (
      <div
        data-customer-data-view-empty=""
        aria-label={ariaLabel}
        className="flex min-h-[160px] items-center justify-center rounded-md p-8 text-base"
        style={{
          color: "var(--sf-muted)",
          borderRadius: "var(--sf-radius)",
          border: "1px dashed var(--sf-border)",
          backgroundColor: "var(--sf-card-bg)",
        }}
      >
        {emptyState ?? "No data yet."}
      </div>
    );
  }

  const cols = deriveColumns<T>(schema, { include: fields });

  if (layout === "table") {
    return (
      <div
        data-customer-data-view=""
        aria-label={ariaLabel}
        className="rounded-md overflow-hidden"
        style={{
          border: "1px solid var(--sf-border)",
          borderRadius: "var(--sf-radius)",
          backgroundColor: "var(--sf-card-bg)",
        }}
      >
        <table className="w-full border-collapse text-base">
          <thead style={{ backgroundColor: "var(--sf-bg)" }}>
            <tr>
              {cols.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="px-4 py-3 text-left text-sm font-medium"
                  style={{ color: "var(--sf-muted)" }}
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
                data-customer-data-view-row=""
                className="border-t"
                style={{ borderColor: "var(--sf-border)" }}
              >
                {cols.map((col) => (
                  <td key={col.key} className="px-4 py-3" style={{ color: "var(--sf-text)" }}>
                    {formatValue(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Cards layout — default
  return (
    <div
      data-customer-data-view=""
      aria-label={ariaLabel}
      className="flex flex-col gap-3"
    >
      {rows.map((row, i) => (
        <CustomerDataViewCard key={i} row={row} cols={cols} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Internal — card row
// ---------------------------------------------------------------------

function CustomerDataViewCard<T extends Record<string, unknown>>({
  row,
  cols,
}: {
  row: T;
  cols: Column<T>[];
}) {
  return (
    <div
      data-customer-data-view-card=""
      className="flex flex-col gap-2 p-4"
      style={{
        backgroundColor: "var(--sf-card-bg)",
        border: "1px solid var(--sf-border)",
        borderRadius: "var(--sf-radius)",
        color: "var(--sf-text)",
      }}
    >
      {cols.map((col) => (
        <div key={col.key} className="flex items-baseline gap-3">
          <span
            className="text-sm shrink-0 min-w-[80px]"
            style={{ color: "var(--sf-muted)" }}
          >
            {col.title}
          </span>
          <span className="text-base flex-1">{formatValue(row[col.key])}</span>
        </div>
      ))}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
