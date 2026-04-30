// April 30, 2026 — usage queries for the /settings/billing surface.
//
// Two queries fan out from here:
//   `getCurrentContactCount(orgId)` — total contacts (rolling, since
//      contacts is an "absolute count" meter — last aggregation)
//   `getAgentRunsThisMonth(orgId)`  — workflow_runs rows created since
//      the start of the current calendar month UTC. Mirrors how the
//      Stripe meter aggregates (sum, monthly billing window) closely
//      enough for in-app usage display.
//
// We deliberately query our own DB instead of Stripe's billing meter
// summary API. Trade-offs:
//   + faster (one Postgres count vs. round-trip to Stripe)
//   + no rate-limit risk on /settings/billing renders
//   - slight drift if the meter event reporting fails — but those
//     failures log and the cron picks up the next night, so divergence
//     is bounded.

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema/contacts";
import { workflowRuns } from "@/db/schema/workflow-runs";
import { getPlan, type Plan, type TierId } from "./plans";
import { normalizeTierId } from "./features";

export type UsageSummary = {
  tier: TierId;
  plan: Plan;
  contacts: {
    used: number;
    included: number; // -1 = unlimited
    overage: number; // 0 if under cap or unlimited
    overageCost: number; // dollars (estimated)
    percent: number; // 0..100, capped at 100
  };
  agentRuns: {
    used: number;
    included: number;
    overage: number;
    overageCost: number;
    percent: number;
  };
  /** Estimated total this period: base + overage + per-run cost (Scale).
   *  Free is always 0. */
  estimatedTotal: number;
};

/** Total contact count for an org (no time window). Used both for the
 *  free-tier hard cap and for the contacts meter snapshot. */
export async function getCurrentContactCount(orgId: string): Promise<number> {
  if (!orgId) return 0;
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.orgId, orgId));
  const raw = row?.value as unknown;
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/** Workflow runs started this calendar month (UTC). The Stripe agent
 *  runs meter aggregates by Stripe's billing window; this approximation
 *  is "good enough" for in-app usage display. */
export async function getAgentRunsThisMonth(orgId: string): Promise<number> {
  if (!orgId) return 0;
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.orgId, orgId), gte(workflowRuns.createdAt, startOfMonth)));
  const raw = row?.value as unknown;
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/** Build a UsageSummary for the org. Pure data — caller decides how to
 *  render (settings page, dashboard widget, banner thresholds, etc.). */
export async function getUsageSummary(
  orgId: string | null | undefined,
  storedTier: string | null | undefined
): Promise<UsageSummary> {
  const tier = normalizeTierId(storedTier);
  // getPlan() always resolves a tier id since the catalog ships free /
  // growth / scale; cast handles the typescript narrowing.
  const plan = (getPlan(tier) ?? getPlan("free"))!;

  const [contactsUsed, agentRunsUsed] = orgId
    ? await Promise.all([getCurrentContactCount(orgId), getAgentRunsThisMonth(orgId)])
    : [0, 0];

  const contactsLimit = plan.limits.maxContacts;
  const agentRunsLimit = plan.limits.maxAgentRunsPerMonth;

  const contactsIncluded = plan.metered.contacts?.includedQty ?? contactsLimit;
  const agentRunsIncluded = plan.metered.agentRuns?.includedQty ?? agentRunsLimit;

  const contactsOverage =
    contactsIncluded > 0 ? Math.max(0, contactsUsed - contactsIncluded) : 0;
  const agentRunsOverage =
    agentRunsIncluded >= 0 ? Math.max(0, agentRunsUsed - agentRunsIncluded) : 0;

  const contactsOverageCost = plan.metered.contacts
    ? contactsOverage * plan.metered.contacts.pricePerUnit
    : 0;
  const agentRunsOverageCost = plan.metered.agentRuns
    ? agentRunsOverage * plan.metered.agentRuns.pricePerUnit
    : 0;

  // For Scale agent runs, includedQty=0 so all runs are billed —
  // overageCost above already captures `agentRunsUsed * 0.02`.

  const denominatorContacts = contactsIncluded > 0 ? contactsIncluded : Math.max(1, contactsUsed);
  const denominatorRuns = agentRunsIncluded > 0 ? agentRunsIncluded : Math.max(1, agentRunsUsed);

  const contactsPercent =
    contactsIncluded === -1 || contactsIncluded === 0
      ? 0
      : Math.min(100, Math.round((contactsUsed / denominatorContacts) * 100));
  const agentRunsPercent =
    agentRunsIncluded === -1 || agentRunsIncluded === 0
      ? 0
      : Math.min(100, Math.round((agentRunsUsed / denominatorRuns) * 100));

  const estimatedTotal =
    plan.price + contactsOverageCost + agentRunsOverageCost;

  return {
    tier,
    plan,
    contacts: {
      used: contactsUsed,
      included: contactsIncluded,
      overage: contactsOverage,
      overageCost: contactsOverageCost,
      percent: contactsPercent,
    },
    agentRuns: {
      used: agentRunsUsed,
      included: agentRunsIncluded,
      overage: agentRunsOverage,
      overageCost: agentRunsOverageCost,
      percent: agentRunsPercent,
    },
    estimatedTotal,
  };
}
