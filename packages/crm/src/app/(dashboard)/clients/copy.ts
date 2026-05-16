// packages/crm/src/app/(dashboard)/clients/copy.ts
//
// Polished copy strings for the /clients page. Source: design:ux-copy
// skill invocation 2026-05-16 (Cut B Phase 3). Centralized so QA can
// review and i18n is a one-file change later.
//
// Voice rules (audited against Cut A's CreateClientCta):
//   - confident, plain, agency-grade
//   - no exclamation marks, no emoji
//   - single noun: "client workspace" appears across heading/CTA/empty
//     state so agencies pattern-match faster
//   - dashboard CTA uses the compact "Add client workspace" (16 chars);
//     this page uses "New client workspace" (21 chars) — both verbs
//     stay in the same family but the page-level surface gets the
//     fuller phrasing.

export const CLIENTS_COPY = {
  pageHeading: "Client workspaces",
  pageSubheading: "Every client you've built for, with live activity at a glance.",
  usageBadge: {
    underLimit: (used: number, limit: number) => `${used} / ${limit} workspaces`,
    atLimit: "Limit reached",
    unlimited: "Unlimited workspaces",
  },
  primaryCta: "New client workspace",
  emptyState: {
    heading: "No client workspaces yet",
    body: "Paste a client's website URL and SeldonFrame builds their CRM, booking page, and AI agents in minutes.",
    cta: "Build your first client",
    illustrationAlt: "Empty client folder icon",
  },
  cardStatus: {
    active: "Active",
    setup: "In setup",
    paused: "Paused",
  },
  formatContactCount: (n: number) =>
    n === 1 ? "1 contact" : `${n} contacts`,
  activity: {
    none: "No activity yet",
    yesterday: "Yesterday",
  },
  formatLeadsThisWeek: (n: number) => {
    if (n === 0) return "0 leads this week";
    if (n === 1) return "1 new lead this week";
    return `${n} new leads this week`;
  },
  cardCta: "Open dashboard",
  // Pairs with the UpgradeModal trigger; spells out "client workspaces"
  // explicitly to avoid ambiguity with CRM contacts.
  atLimitTooltip: "Upgrade your plan to add more client workspaces",
} as const;
