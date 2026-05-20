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
  pageSubheading: "Every client you've built for. Spin up a new one in 60 seconds.",
  usageBadge: {
    underLimit: (used: number, limit: number) => `${used} / ${limit} workspaces`,
    atLimit: "Limit reached",
    unlimited: "Unlimited workspaces",
  },
  primaryCta: "New client workspace",
  emptyState: {
    heading: "Spin up your first client workspace",
    body: "Paste a client's website URL and SeldonFrame builds their CRM, booking page, intake form, and AI chatbot in about 60 seconds.",
    cta: "Build your first client",
    illustrationAlt: "Empty client workspaces — sparkle icon",
  },
  cardStatus: {
    active: "Active",
    setup: "In setup",
    paused: "Paused",
  },
  formatActiveCount: (n: number) => (n === 1 ? "1 active" : `${n} active`),
  formatContactCount: (n: number) =>
    n === 1 ? "1 contact" : `${n} contacts`,
  activity: {
    none: "No activity yet",
    yesterday: "Yesterday",
  },
  formatLeadsThisWeek: (n: number) => {
    if (n === 0) return "0 new leads";
    if (n === 1) return "1 new lead";
    return `${n} new leads`;
  },
  formatBookingsThisWeek: (n: number) => {
    if (n === 0) return "0 bookings";
    if (n === 1) return "1 booking";
    return `${n} bookings`;
  },
  cardCta: "Open dashboard",
  cardStatLabels: {
    contacts: "Contacts",
    leads: "Leads this week",
    bookings: "Bookings this week",
    activity: "Last activity",
  },
  // Pairs with the UpgradeModal trigger; spells out "client workspaces"
  // explicitly to avoid ambiguity with CRM contacts.
  atLimitTooltip: "Upgrade your plan to add more client workspaces",
} as const;
