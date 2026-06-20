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
//   Agents    → /automations
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
  /** SF_SUPERADMIN_EMAILS membership — surfaces the SF Admin entry. */
  isSuperAdmin: boolean;
  /** The operator's PRIMARY org id (user.orgId). Used to build the
   *  "← Back to agency" switch link inside a client workspace. */
  primaryOrgId: string | null;
  labels: NavLabels;
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

/**
 * Pure nav builder. Returns the NavGroup[] the sidebar renders for a
 * given session. No React, no hooks, no I/O — every input is explicit
 * so the six-noun contract is unit-testable.
 */
export function buildNavGroups(input: BuildNavInput): NavGroup[] {
  const { sessionType, workspaceCount, hiddenBlocks, isSuperAdmin, primaryOrgId, labels } = input;

  const hiddenHrefs = new Set(hiddenBlocks.map((slug) => hiddenSlugToHref[slug]).filter(Boolean));

  const filterHidden = (items: NavItem[]): NavItem[] => items.filter((item) => !hiddenHrefs.has(item.href));

  const superAdminItems: NavItem[] = isSuperAdmin
    ? [{ href: "/super-admin", label: "SF Admin", icon: "Shield" }]
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

    return [
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
        items: filterHidden([{ href: "/settings", label: "Settings", icon: "Settings" }, ...superAdminItems]),
      },
    ].filter((group) => group.items.length > 0);
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
      items: filterHidden([
        { href: "/dashboard", label: "Home", icon: "Home" },
        { href: "/automations", label: "Agents", icon: "Bot" },
      ]),
    },
    {
      title: "CUSTOMERS",
      items: filterHidden([
        // Customers is the CRM contacts surface (today mislabeled
        // "Clients"). Bookings + Intake Forms hang under it as the
        // other inbound-customer surfaces.
        { href: "/contacts", label: "Customers", icon: "Users" },
        { href: "/bookings", label: "Bookings", icon: "Calendar", indent: true },
        { href: "/forms", label: labels.intakeForm.plural, icon: "FileText", indent: true },
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
        { href: "/docs", label: "Docs", icon: "BookOpen" },
        { href: "https://discord.gg/sbVUu976NW", label: "Discord", icon: "MessageCircle", external: true },
        { href: "/settings", label: "Settings", icon: "Settings" },
        ...superAdminItems,
      ]),
    },
  ].filter((group) => group.items.length > 0);
}
