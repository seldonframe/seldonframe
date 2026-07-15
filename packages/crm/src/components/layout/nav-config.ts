// components/layout/nav-config.ts — the PURE nav builder.
//
// 2026-06-20 — icp3-wedge: the operator dashboard's left nav was
// unified into a SIX-NOUN structure that adapts by what the operator
// HAS, not who they are (Shopify "one admin" philosophy):
//
//   Home · Agents · Customers · Inbox · Money · Clients  (+ System)
//
// Each noun is a real, clickable nav link to the existing route; where
// a noun spans more than one legacy screen the extras render as
// INDENTED sub-items beneath it (NavItem.indent === true) so NOTHING
// that was reachable before becomes unreachable. This is a NAV-ONLY
// refactor — no route/page was moved, merged, or deleted.
//
// The mapping (every legacy href preserved):
//   Home      → /dashboard
//   Agents    → /studio/agents       (sub: /automations [Automations])
//   Customers → /contacts            (sub: /bookings, /forms)
//   Inbox     → /conversations       (sub: /emails [Messaging])
//   Money     → /deals               (sub: /proposals)
//   Clients   → /clients             (ONLY when workspaceCount > 1)
//   System    → /docs, Discord, /settings (+ /super-admin if admin)
//
// This module is deliberately framework-free (no React, no hooks) so it
// can be unit-tested in isolation. The sidebar component resolves the
// soul-driven labels via useLabels() and threads them in as `labels`.

import type { NavGroup, NavItem } from "@/components/layout/sidebar-nav";
import type { ModuleId } from "@/lib/workspace/modules";

/** Which surface the active session is looking at. Mirrors the three
 *  branches the sidebar used to hardcode inline. */
export type NavSessionType =
  /** Sub-tenant magic-link operator (operator-portal cookie). Trimmed
   *  CRM-essentials nav only. */
  | "operator-portal"
  /** Agency operator who has switched INTO a client workspace. Full
   *  per-workspace surface + a "← Back to agency" escape hatch, minus
   *  agency-only builder surfaces (portfolio, proposals, docs). */
  | "inside-client-workspace"
  /** Default: agency operator on their own workspace. The full
   *  six-noun nav. */
  | "agency";

/** Minimal soul-resolved label shape the nav needs. Subset of
 *  resolveLabels()'s return so the builder stays pure / testable. */
export type NavLabels = {
  contact: { singular: string; plural: string };
  deal: { singular: string; plural: string };
  intakeForm: { singular: string; plural: string };
};

export type BuildNavInput = {
  sessionType: NavSessionType;
  /** How many workspaces this operator owns. Drives progressive
   *  disclosure: the Clients portfolio noun + the workspace switcher
   *  only appear when > 1. */
  workspaceCount: number;
  /** organizations.hiddenBlocks — block slugs the operator turned off
   *  in visibility settings. Filtered via hiddenSlugToHref below. */
  hiddenBlocks: string[];
  /** SF_SUPERADMIN_EMAILS membership — surfaces the Seldon Admin entry. */
  isSuperAdmin: boolean;
  /** The operator's PRIMARY org id (user.orgId). Used to build the
   *  "← Back to agency" switch link inside a client workspace. */
  primaryOrgId: string | null;
  labels: NavLabels;
  /** Simple-home module filter (2026-07-05) — Task 3's readEnabledModules().
   *  `undefined`/`null` BOTH mean "no filtering": grandfathered orgs and
   *  flag-off flow through IDENTICALLY to today's unfiltered nav. Only
   *  applies to the inside-client-workspace branch (the simplified-home
   *  audience); other session types ignore it. When set, a "Turn on more
   *  features" item is appended to the last group. */
  enabledModules?: ModuleId[] | null;
  /** Inbox SMS-gate (2026-07-05) — true when the workspace has a usable
   *  (accountSid + authToken) Twilio number, per
   *  pickTelephonyFromIntegrations. When true, `/conversations` shows
   *  even if "inbox" isn't in enabledModules — SMS being live makes the
   *  inbox load-bearing regardless of the operator's module toggle.
   *  Ignored when enabledModules is null/undefined (grandfathered / flag
   *  off — nothing is filtered either way). */
  smsLive?: boolean;
  /** Never-fail-compile (2026-07-15) — SF_DRAFT_APPROVALS. This module is
   *  framework-free (no env reads), so the flag arrives as an explicit
   *  input, same pattern as isSuperAdmin: the caller (sidebar.tsx's server
   *  layout) resolves it and threads it through. Surfaces the Approvals
   *  nav entry when true; absent/false → today's nav, unchanged. */
  draftApprovalsOn?: boolean;
};

// Block-slug → href map for visibility filtering. Lifted verbatim from
// sidebar.tsx so the contract is identical: `contacts` is deliberately
// OMITTED — Clients/Customers is a baseline CRM surface and must always
// appear (so operators with `crm` in hiddenBlocks can still re-enable).
const hiddenSlugToHref: Record<string, string> = {
  bookings: "/bookings",
  deals: "/deals",
  email: "/emails",
  pages: "/landing",
  forms: "/forms",
  automations: "/automations",
  payments: "/settings/integrations",
  seldon: "/seldon",
};

// Simple-home (2026-07-05) — module id → the hrefs it gates in the
// inside-client-workspace branch. Only items in this map are filterable
// by enabledModules; Settings and "← Back to agency" are NEVER in it (the
// brief: never filtered). "website" has no dedicated nav item in this
// branch today — it's reachable from Home — so it maps to no href.
const MODULE_TO_HREFS: Partial<Record<ModuleId, string[]>> = {
  home: ["/dashboard"],
  customers: ["/contacts"],
  bookings: ["/bookings"],
  leads: ["/forms"],
  inbox: ["/conversations"],
  messaging: ["/emails"],
  money: ["/deals"],
  agents: ["/automations"],
  integrations: ["/integrations"],
};

const TURN_ON_MORE_FEATURES_ITEM: NavItem = {
  href: "/settings/features",
  label: "Turn on more features",
  icon: "Sparkles",
};

/**
 * Filters `groups` down to only the items whose href is gated by an
 * enabled module (plus any href with no module mapping, e.g. the
 * always-present Settings/Back-to-agency items), then appends the
 * "Turn on more features" item to the last surviving group. Drops
 * group headers that end up with zero items. No-op (returns groups
 * unchanged) when `enabledModules` is null/undefined.
 */
function applyModuleFilter(
  groups: NavGroup[],
  enabledModules: ModuleId[] | null | undefined,
  smsLive: boolean = false,
): NavGroup[] {
  if (enabledModules == null) return groups;

  const enabledHrefs = new Set<string>();
  for (const moduleId of enabledModules) {
    for (const href of MODULE_TO_HREFS[moduleId] ?? []) {
      enabledHrefs.add(href);
    }
  }
  // Any href NOT present in MODULE_TO_HREFS at all (Settings, Back to
  // agency, Seldon Admin) is never gated by a module and always stays.
  const gatedHrefs = new Set(Object.values(MODULE_TO_HREFS).flat());

  const filtered = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !gatedHrefs.has(item.href) ||
          enabledHrefs.has(item.href) ||
          (item.href === "/conversations" && smsLive),
      ),
    }))
    .filter((group) => group.items.length > 0);

  if (filtered.length === 0) return filtered;

  const lastIndex = filtered.length - 1;
  return filtered.map((group, index) =>
    index === lastIndex ? { ...group, items: [...group.items, TURN_ON_MORE_FEATURES_ITEM] } : group,
  );
}

/**
 * Pure nav builder. Returns the NavGroup[] the sidebar renders for a
 * given session. No React, no hooks, no I/O — every input is explicit
 * so the six-noun contract is unit-testable.
 */
export function buildNavGroups(input: BuildNavInput): NavGroup[] {
  const {
    sessionType,
    workspaceCount,
    hiddenBlocks,
    isSuperAdmin,
    primaryOrgId,
    labels,
    enabledModules,
    smsLive,
    draftApprovalsOn = false,
  } = input;

  const hiddenHrefs = new Set(hiddenBlocks.map((slug) => hiddenSlugToHref[slug]).filter(Boolean));

  const filterHidden = (items: NavItem[]): NavItem[] => items.filter((item) => !hiddenHrefs.has(item.href));

  const superAdminItems: NavItem[] = isSuperAdmin
    ? [{ href: "/super-admin", label: "Seldon Admin", icon: "Shield" }]
    : [];

  // -------------------------------------------------------------------
  // operator-portal — trimmed CRM essentials (HVAC owner / dentist).
  // Identical surface set to the legacy isOperatorSession branch, just
  // relabelled to the noun scheme (Dashboard→Home, Contacts→Customers).
  // -------------------------------------------------------------------
  if (sessionType === "operator-portal") {
    return [
      {
        title: "OVERVIEW",
        items: filterHidden([{ href: "/dashboard", label: "Home", icon: "Home" }]),
      },
      {
        title: "CRM",
        items: filterHidden([
          { href: "/contacts", label: labels.contact.plural, icon: "Users" },
          { href: "/deals", label: labels.deal.plural, icon: "DollarSign" },
          { href: "/bookings", label: "Bookings", icon: "Calendar" },
        ]),
      },
    ].filter((group) => group.items.length > 0);
  }

  // -------------------------------------------------------------------
  // inside-client-workspace — agency operator who switched INTO a
  // client. Same per-workspace surface set as the legacy branch
  // (contacts/deals/bookings/conversations/emails/forms/automations +
  // settings), relabelled to the noun scheme, plus the "← Back to
  // agency" escape hatch. No portfolio/proposals/docs (agency-only).
  // -------------------------------------------------------------------
  if (sessionType === "inside-client-workspace") {
    const backToAgency: NavItem = primaryOrgId
      ? {
          // Flips sf_active_org_id back to the agency's primary org
          // BEFORE redirecting so the operator lands on the agency
          // dashboard with the full nav restored.
          href: `/switch-workspace?to=${encodeURIComponent(primaryOrgId)}&next=${encodeURIComponent("/dashboard")}`,
          label: "← Back to agency",
          icon: "ChevronLeft",
        }
      : // Fallback: no primary org id (rare — synthesised user). Send
        // them to /clients which at least lists their workspaces.
        { href: "/clients", label: "← Back to agency", icon: "ChevronLeft" };

    const groups: NavGroup[] = [
      {
        title: "OVERVIEW",
        items: filterHidden([{ href: "/dashboard", label: "Home", icon: "Home" }, backToAgency]),
      },
      {
        title: "CUSTOMERS",
        items: filterHidden([
          { href: "/contacts", label: labels.contact.plural, icon: "Users" },
          { href: "/bookings", label: "Bookings", icon: "Calendar", indent: true },
          { href: "/forms", label: labels.intakeForm.plural, icon: "FileText", indent: true },
        ]),
      },
      {
        title: "INBOX",
        items: filterHidden([
          { href: "/conversations", label: "Inbox", icon: "Inbox" },
          { href: "/emails", label: "Messaging", icon: "Mail", indent: true },
        ]),
      },
      {
        title: "MONEY",
        items: filterHidden([{ href: "/deals", label: "Money", icon: "DollarSign" }]),
      },
      {
        title: "AGENTS",
        // Voice Receptionist editor lives at /automations/voice-receptionist
        // — a per-client-workspace surface, so the client view needs it.
        items: filterHidden([{ href: "/automations", label: "Agents", icon: "Bot" }]),
      },
      {
        title: "SYSTEM",
        items: filterHidden([
          { href: "/integrations", label: "Integrations", icon: "Puzzle" },
          { href: "/settings", label: "Settings", icon: "Settings" },
          ...superAdminItems,
        ]),
      },
    ].filter((group) => group.items.length > 0);

    return applyModuleFilter(groups, enabledModules, smsLive);
  }

  // -------------------------------------------------------------------
  // agency (default) — the full SIX-NOUN nav.
  // -------------------------------------------------------------------

  // Clients (PORTFOLIO) noun: progressive disclosure — only when the
  // operator actually has more than one workspace.
  const clientsNoun: NavItem[] = workspaceCount > 1 ? [{ href: "/clients", label: "Clients", icon: "Briefcase" }] : [];

  return [
    {
      // The six nouns. Untitled lead group keeps Home/Agents flush to
      // the top like Shopify's primary admin rail.
      //
      // ICP-3 — "Agents" is now the AGENT BUILDER (Studio): the builder
      // creates reusable, sellable agent templates at /studio/agents and
      // deploys them to many SMB clients. The legacy /automations catalog
      // (typed workflow templates + the per-workspace voice receptionist)
      // hangs UNDER Agents as an indented "Automations" sub-item so it stays
      // reachable — nothing that was reachable before becomes unreachable.
      items: filterHidden([
        { href: "/dashboard", label: "Home", icon: "Home" },
        { href: "/studio/agents", label: "Agents", icon: "Bot" },
        { href: "/automations", label: "Automations", icon: "Zap", indent: true },
      ]),
    },
    {
      title: "CUSTOMERS",
      items: filterHidden([
        // Customers is the CRM contacts surface (today mislabeled
        // "Clients"). Bookings + Intake Forms hang under it as the
        // other inbound-customer surfaces.
        { href: "/contacts", label: labels.contact.plural, icon: "Users" },
        { href: "/bookings", label: "Bookings", icon: "Calendar", indent: true },
        { href: "/forms", label: labels.intakeForm.plural, icon: "FileText", indent: true },
        // Never-fail-compile (SF_DRAFT_APPROVALS) — the drafts inbox for
        // work a compiled agent prepared but can't execute itself. Count
        // badge SKIPPED in v1 (no badge mechanism exists on NavItem today —
        // see build-report for the conscious cut).
        ...(draftApprovalsOn
          ? [{ href: "/approvals", label: "Approvals", icon: "CheckSquare" }]
          : []),
      ]),
    },
    {
      title: "INBOX",
      items: filterHidden([
        { href: "/conversations", label: "Inbox", icon: "Inbox" },
        // Messaging (the /emails page) now hosts SMS + email outbound
        // editors; it sits under Inbox as the outbound counterpart.
        { href: "/emails", label: "Messaging", icon: "Mail", indent: true },
      ]),
    },
    {
      title: "MONEY",
      items: filterHidden([
        { href: "/deals", label: "Money", icon: "DollarSign" },
        // Proposals are the upstream of Won deals.
        { href: "/proposals", label: "Proposals", icon: "FileText", indent: true },
      ]),
    },
    {
      // PORTFOLIO — only rendered for multi-tenant operators.
      ...(clientsNoun.length > 0 ? { title: "PORTFOLIO" } : {}),
      items: filterHidden(clientsNoun),
    },
    {
      title: "SYSTEM",
      items: filterHidden([
        // Integrations — the in-product managed-OAuth Connect surface
        // (Composio: connect Gmail / Calendar / Slack / HubSpot / … so
        // agents can act in the operator's real apps).
        { href: "/integrations", label: "Integrations", icon: "Puzzle" },
        { href: "/docs", label: "Docs", icon: "BookOpen" },
        { href: "https://discord.gg/sbVUu976NW", label: "Discord", icon: "MessageCircle", external: true },
        { href: "/settings", label: "Settings", icon: "Settings" },
        ...superAdminItems,
      ]),
    },
  ].filter((group) => group.items.length > 0);
}
