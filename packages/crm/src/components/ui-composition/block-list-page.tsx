// <BlockListPage> — the admin list-page preset. Composes
// <PageShell> + <EntityTable> with a single unified props surface
// so scaffolded blocks' admin pages land as one-liners:
//
//   export default async function ContactsPage() {
//     const rows = await loadContacts();
//     return (
//       <BlockListPage title="Contacts" schema={ContactSchema} rows={rows} />
//     );
//   }
//
// Shipped in SLICE 4a PR 1 C4 per audit §2.1.
//
// Every prop is forwarded to the child it targets:
//   - title / description / breadcrumbs / actions → PageShell
//   - schema / rows / columns / emptyState / ariaLabel → EntityTable
//
// Server component — no state.

import type { ReactNode } from "react";
import type { ZodObject, ZodTypeAny } from "zod";

import { PageShell, type BreadcrumbEntry } from "./page-shell";
import { EntityTable } from "./entity-table";
import type { DeriveColumnsOptions } from "@/lib/ui/derive-columns";

export type BlockListPageProps<T extends Record<string, unknown>> = {
  // PageShell props
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbEntry[];
  actions?: ReactNode;
  // EntityTable props
  schema: ZodObject<Record<string, ZodTypeAny>>;
  rows: T[];
  columns?: DeriveColumnsOptions<T>;
  emptyState?: ReactNode;
  ariaLabel?: string;
};

export function BlockListPage<T extends Record<string, unknown>>({
  title,
  description,
  breadcrumbs,
  actions,
  schema,
  rows,
  columns,
  emptyState,
  ariaLabel,
}: BlockListPageProps<T>) {
  return (
    <PageShell
      title={title}
      description={description}
      breadcrumbs={breadcrumbs}
      actions={actions}
    >
      <EntityTable
        schema={schema}
        rows={rows}
        columns={columns}
        emptyState={emptyState}
        ariaLabel={ariaLabel ?? title}
      />
    </PageShell>
  );
}
