// <BlockDetailPage> — admin detail-page wrapper. Composes
// <PageShell> with an optional subtitle + optional tabs nav.
// Pattern for every block's entity detail page:
//
//   export default async function ContactPage({ params, searchParams }) {
//     const contact = await loadContact(params.id);
//     const activeTab = searchParams.tab ?? "overview";
//     return (
//       <BlockDetailPage
//         title={contact.name}
//         subtitle={contact.email}
//         breadcrumbs={[…]}
//         actions={<EditButton/>}
//         tabs={[
//           { id: "overview",  label: "Overview",  href: "?tab=overview" },
//           { id: "activities", label: "Activities", href: "?tab=activities" },
//         ]}
//         activeTab={activeTab}
//       >
//         {activeTab === "overview" ? <OverviewTab/> : <ActivitiesTab/>}
//       </BlockDetailPage>
//     );
//   }
//
// Tabs are URL-driven (server component friendly — no client state).
// Parent owns which tab content renders; this component owns the
// nav chrome + active styling.
//
// Shipped in SLICE 4a PR 2 C1 per audit §2.1.

import type { ReactNode } from "react";
import Link from "next/link";

import { PageShell, type BreadcrumbEntry } from "./page-shell";

export type DetailTab = {
  id: string;
  label: string;
  href: string;
};

export type BlockDetailPageProps = {
  title: string;
  /** Secondary line under the title — email, status, etc. */
  subtitle?: string;
  breadcrumbs?: BreadcrumbEntry[];
  actions?: ReactNode;
  /** Tab list — renders as URL-linked nav. Parent renders content via children. */
  tabs?: DetailTab[];
  /** id of the tab to mark as aria-current="page". Only meaningful with tabs. */
  activeTab?: string;
  children: ReactNode;
};

export function BlockDetailPage({
  title,
  subtitle,
  breadcrumbs,
  actions,
  tabs,
  activeTab,
  children,
}: BlockDetailPageProps) {
  const hasTabs = tabs && tabs.length > 0;

  return (
    <PageShell
      title={title}
      breadcrumbs={breadcrumbs}
      actions={actions}
    >
      {subtitle ? (
        <p
          data-block-detail-subtitle=""
          className="-mt-4 text-body text-muted-foreground"
        >
          {subtitle}
        </p>
      ) : null}

      {hasTabs ? <DetailTabs tabs={tabs!} activeTab={activeTab} /> : null}

      <div className="flex flex-1 flex-col gap-6">{children}</div>
    </PageShell>
  );
}

function DetailTabs({
  tabs,
  activeTab,
}: {
  tabs: DetailTab[];
  activeTab?: string;
}) {
  return (
    <nav
      data-block-detail-tabs=""
      aria-label="Tabs"
      className="flex items-center gap-1 border-b border-border"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            {...(isActive ? { "aria-current": "page" as const } : {})}
            className={
              "px-4 py-2 text-label transition-colors duration-fast border-b-2 -mb-px " +
              (isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
