// <PageShell> — admin page wrapper with title + breadcrumbs +
// actions + content area. The common layout for every block's
// admin root page.
//
// Shipped in SLICE 4a PR 1 C3 per audit §2.1.
//
// Composes:
//   - `text-page-title` typography utility (from tailwind.config.ts)
//   - Token wrapper for spacing + muted-foreground color
//
// Server component (no state). Client-specific interactions (command
// palette, user menu) live in the admin layout chrome, not here.
//
// Quality gates targeted (§4):
//   - Typography via tokens.text() → consistent scale
//   - Spacing from the token scale (no ad-hoc pixels)
//   - `<main>` landmark + `<nav aria-label="Breadcrumb">` for a11y
//   - Dark/light both work (uses shadcn foreground/muted-foreground)

import type { ReactNode } from "react";
import Link from "next/link";

export type BreadcrumbEntry = {
  label: string;
  /** When present, entry renders as a link. Last entry typically omits. */
  href?: string;
};

export type PageShellProps = {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbEntry[];
  actions?: ReactNode;
  children: ReactNode;
};

export function PageShell({
  title,
  description,
  breadcrumbs,
  actions,
  children,
}: PageShellProps) {
  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 p-8">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <Breadcrumbs entries={breadcrumbs} />
      ) : null}
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title text-foreground">{title}</h1>
          {description ? (
            <p
              data-page-shell-description=""
              className="text-body text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            data-page-shell-actions=""
            className="flex shrink-0 items-center gap-2"
          >
            {actions}
          </div>
        ) : null}
      </header>
      <div className="flex flex-1 flex-col gap-6">{children}</div>
    </main>
  );
}

function Breadcrumbs({ entries }: { entries: BreadcrumbEntry[] }) {
  return (
    <nav
      data-page-shell-breadcrumbs=""
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-tiny text-muted-foreground"
    >
      {entries.map((entry, i) => (
        <BreadcrumbItem
          key={`${entry.label}-${i}`}
          entry={entry}
          isLast={i === entries.length - 1}
        />
      ))}
    </nav>
  );
}

function BreadcrumbItem({
  entry,
  isLast,
}: {
  entry: BreadcrumbEntry;
  isLast: boolean;
}) {
  const content = entry.href && !isLast ? (
    <Link
      href={entry.href}
      className="hover:text-foreground transition-colors duration-fast"
    >
      {entry.label}
    </Link>
  ) : (
    <span className={isLast ? "text-foreground" : ""}>{entry.label}</span>
  );
  return (
    <>
      {content}
      {!isLast ? (
        <span aria-hidden="true" className="opacity-50">
          /
        </span>
      ) : null}
    </>
  );
}
