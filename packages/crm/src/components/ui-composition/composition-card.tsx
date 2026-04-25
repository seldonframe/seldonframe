// <CompositionCard> — cross-block embeddable card. Renders a
// titled/subtitled card with a body + optional "View all" footer
// link. Supports schema-driven row rendering for tabular data
// from other blocks, and explicit error-state modeling for the
// common "this block isn't installed / fetch failed / nothing
// here" cases.
//
// Scope for v1:
//   - Pure rendering. Parent handles data-fetch + installed-check +
//     state classification, then passes `state` in.
//   - Three explicit error/empty states: "unavailable" (block not
//     installed), "error" (fetch/rendering error), "empty" (no
//     data). Each has a sensible default message and a per-card
//     override.
//   - Schema-driven row rendering when `schema` + `rows` are passed:
//     each row is Zod-parsed; invalid rows are silently dropped.
//     If all rows drop, the card falls back to its empty state.
//   - `fields` override controls which schema keys render + order
//     (mirrors deriveColumns' `include` pattern).
//   - Default row limit of 5 + "+N more" footer when exceeded.
//
// What this doesn't do (deferred):
//   - Data fetching — belongs in the parent.
//   - Suspense / loading skeleton — lands in PR 3 along with other
//     loading states.
//   - Nested CompositionCard recursion — avoid for now; keep the
//     embedding model one level deep.
//
// Shipped in SLICE 4a PR 2 C4 per audit §2.1. Server component.

import type { ReactNode } from "react";
import Link from "next/link";
import type { ZodObject, ZodTypeAny } from "zod";

export type CompositionCardState = "unavailable" | "error" | "empty";

export type CompositionCardProps<T extends Record<string, unknown> = Record<string, unknown>> = {
  title: string;
  subtitle?: string;
  href?: string;

  /** Explicit state override. Takes precedence over schema+rows rendering. */
  state?: CompositionCardState;
  unavailableMessage?: ReactNode;
  errorMessage?: ReactNode;
  emptyState?: ReactNode;

  /** Optional schema-driven row rendering. */
  schema?: ZodObject<Record<string, ZodTypeAny>>;
  rows?: T[];
  /** Ordered subset of schema keys to render. Defaults to all keys. */
  fields?: (keyof T & string)[];
  /** Max rows to render before collapsing to "+N more". Default 5. */
  maxRows?: number;

  children?: ReactNode;
};

const DEFAULT_MAX_ROWS = 5;

export function CompositionCard<T extends Record<string, unknown>>({
  title,
  subtitle,
  href,
  state,
  unavailableMessage,
  errorMessage,
  emptyState,
  schema,
  rows,
  fields,
  maxRows = DEFAULT_MAX_ROWS,
  children,
}: CompositionCardProps<T>) {
  const body = resolveBody<T>({
    state,
    unavailableMessage,
    errorMessage,
    emptyState,
    schema,
    rows,
    fields,
    maxRows,
    children,
  });

  return (
    <section
      data-composition-card=""
      aria-label={title}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-label text-foreground font-medium">{title}</h3>
          {subtitle ? (
            <p
              data-composition-card-subtitle=""
              className="text-tiny text-muted-foreground"
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-2">{body}</div>

      {href ? (
        <footer className="pt-1">
          <Link
            data-composition-card-href=""
            href={href}
            className="text-label text-muted-foreground hover:text-foreground transition-colors duration-fast"
          >
            View all →
          </Link>
        </footer>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------
// Body resolution
// ---------------------------------------------------------------------

type ResolveBodyArgs<T extends Record<string, unknown>> = {
  state?: CompositionCardState;
  unavailableMessage?: ReactNode;
  errorMessage?: ReactNode;
  emptyState?: ReactNode;
  schema?: ZodObject<Record<string, ZodTypeAny>>;
  rows?: T[];
  fields?: (keyof T & string)[];
  maxRows: number;
  children?: ReactNode;
};

function resolveBody<T extends Record<string, unknown>>(args: ResolveBodyArgs<T>): ReactNode {
  if (args.state === "unavailable") return renderUnavailable(args.unavailableMessage);
  if (args.state === "error") return renderError(args.errorMessage);
  if (args.state === "empty") return renderEmpty(args.emptyState);

  // Schema-driven path.
  if (args.schema && args.rows !== undefined) {
    const validated = args.rows
      .map((row) => args.schema!.safeParse(row))
      .filter((result) => result.success)
      .map((result) => result.data as Record<string, unknown>);

    if (validated.length === 0) return renderEmpty(args.emptyState);

    const visible = validated.slice(0, args.maxRows);
    const overflow = validated.length - visible.length;
    const keys = resolveKeys<T>(args.schema, args.fields);

    return (
      <>
        <ul className="flex flex-col gap-2">
          {visible.map((row, i) => (
            <li
              key={i}
              className="flex flex-col gap-0.5 rounded-md border border-border/50 bg-background px-3 py-2"
            >
              {keys.map((key) => (
                <div key={key} className="flex items-baseline gap-2">
                  <span className="text-tiny text-muted-foreground shrink-0">
                    {camelToTitle(key)}
                  </span>
                  <span className="text-body text-foreground">
                    {formatValue(row[key])}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>
        {overflow > 0 ? (
          <p className="text-tiny text-muted-foreground">{`+${overflow} more`}</p>
        ) : null}
      </>
    );
  }

  // Fallback: children passthrough.
  return args.children ?? null;
}

function renderUnavailable(override: ReactNode): ReactNode {
  return (
    <div
      data-composition-card-unavailable=""
      className="flex min-h-[80px] items-center justify-center rounded-md border border-dashed border-border bg-card/30 p-4 text-body text-muted-foreground"
    >
      {override ?? "This content requires a block that's not installed."}
    </div>
  );
}

function renderError(override: ReactNode): ReactNode {
  return (
    <div
      data-composition-card-error=""
      className="flex min-h-[80px] items-center justify-center rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-4 text-body text-destructive"
    >
      {override ?? "Failed to load."}
    </div>
  );
}

function renderEmpty(override: ReactNode): ReactNode {
  return (
    <div
      data-composition-card-empty=""
      className="flex min-h-[80px] items-center justify-center rounded-md border border-dashed border-border bg-card/30 p-4 text-body text-muted-foreground"
    >
      {override ?? "Nothing to show."}
    </div>
  );
}

function resolveKeys<T extends Record<string, unknown>>(
  schema: ZodObject<Record<string, ZodTypeAny>>,
  fields: (keyof T & string)[] | undefined,
): (keyof T & string)[] {
  if (fields && fields.length > 0) return fields;
  const shape = (schema as unknown as { shape?: Record<string, ZodTypeAny> }).shape ?? {};
  return Object.keys(shape) as (keyof T & string)[];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function camelToTitle(key: string): string {
  if (!key) return "";
  return key
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}
