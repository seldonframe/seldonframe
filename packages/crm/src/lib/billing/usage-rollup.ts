// Per-sub-account usage meter (2026-07-08) — Task 1: the rollup.
//
// Spec: docs/superpowers/specs/2026-07-08-subaccount-usage-meter-design.md (D1, D2).
//
// v1 is a ROLLUP over EXISTING data, not new metering:
//   - agent_conversations already carries per-org tokensIn/tokensOut/llmCostCents
//     (db/schema/agents.ts:258-303), accumulated per turn by the runtime.
//   - Voice minutes/spend for metered deployments already debit the wallet on
//     call end (wallet-store.ts, idempotency `voice:<callId>`) — this module
//     reads those wallet_transactions rows READ-ONLY, never writes the ledger.
// No migration, no counters, no resets — the calendar-month UTC boundary IS
// the period; a row's own startedAt/createdAt timestamp is the filter.
//
// The counted sub-account SET is the SAME rule the sub-account billing cap
// uses (lib/billing/subaccount-count.ts::isCountableClientSubAccount) — reused
// via the live countClientSubAccountsForOwner query's underlying WHERE, not
// reimplemented. This module takes that org-id list as an injected dependency
// so the org-set resolution stays owned by subaccount-count.ts.

import { and, eq, gte, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentConversations, organizations, partnerAgencies, walletTransactions } from "@/db/schema";

/** Calendar-month UTC period boundary. `now` defaults to `new Date()` in
 *  production callers; injected in tests for determinism across month/year
 *  rollover. Pure — no I/O. */
export function currentPeriodStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Per-org usage row — a client sub-account's rolled-up spend this period. */
export type OrgUsageRow = {
  orgId: string;
  conversations: number;
  tokensIn: number;
  tokensOut: number;
  /** SF's internal estimated cost (agent_conversations.llmCostCents summed).
   *  Under BYOK the real bill is the provider's — ALWAYS labeled "estimated"
   *  wherever displayed (spec D2). */
  estCostCents: number;
  /** Read-only sum of wallet_transactions rows for this org in-period whose
   *  idempotency_key starts with "voice:" (metered voice call debits). Cents,
   *  0 when the org has no metered voice usage. */
  voiceSpendCents: number;
};

export type UsageRollupTotals = {
  conversations: number;
  tokensIn: number;
  tokensOut: number;
  estCostCents: number;
  voiceSpendCents: number;
};

export type UsageRollup = {
  perOrg: OrgUsageRow[];
  totals: UsageRollupTotals;
};

/** One grouped-query result row: `GROUP BY org_id` over agent_conversations
 *  for the counted org set, period-scoped. */
export type ConversationRollupRow = {
  orgId: string;
  conversations: number;
  tokensIn: number;
  tokensOut: number;
  llmCostCents: number;
};

/** One grouped voice-spend result row: sum of wallet_transactions.amountMicros
 *  (converted to cents by the query) for `idempotency_key LIKE 'voice:%'` rows,
 *  grouped by org, period-scoped. */
export type VoiceSpendRow = { orgId: string; cents: number };

/** Injectable dependencies — mirrors the DI pattern in lib/billing/limits.ts /
 *  lib/ai/client.ts (RuntimeAiClientDeps). Lets the mapping/totals logic be
 *  unit-tested without a DB, and keeps the org-set resolution owned by
 *  subaccount-count.ts (never reimplemented here). */
export type UsageRollupDeps = {
  /** The counted CLIENT sub-account org ids for this agency owner — the SAME
   *  rule the billing cap uses (parentAgencyId owned by userId, archivedAt
   *  NULL, ownerId distinct from the owner). */
  countedSubAccountOrgIds: (userId: string) => Promise<string[]>;
  /** ONE `GROUP BY org_id` query over agent_conversations for the given org
   *  ids, `startedAt >= periodStart`. */
  queryConversationRollup: (
    orgIds: string[],
    periodStart: Date,
  ) => Promise<ConversationRollupRow[]>;
  /** Read-only sum of wallet_transactions rows for the given org ids,
   *  `idempotency_key LIKE 'voice:%'`, `createdAt >= periodStart`, grouped by
   *  org. Never touches (writes) the ledger. */
  queryVoiceSpendCents: (orgIds: string[], periodStart: Date) => Promise<VoiceSpendRow[]>;
};

/** The SAME counted-sub-account predicate as subaccount-count.ts, resolved
 *  directly to org ids (that module returns a COUNT; this rollup needs the
 *  actual ids to group by). Mirrors its WHERE clause exactly. */
async function defaultCountedSubAccountOrgIds(userId: string): Promise<string[]> {
  const ownedAgencies = await db
    .select({ id: partnerAgencies.id })
    .from(partnerAgencies)
    .where(eq(partnerAgencies.ownerUserId, userId));

  if (ownedAgencies.length === 0) return [];
  const agencyIds = ownedAgencies.map((a) => a.id);

  const attached = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        inArray(organizations.parentAgencyId, agencyIds),
        isNull(organizations.archivedAt),
        or(isNull(organizations.ownerId), ne(organizations.ownerId, userId)),
      ),
    );

  return attached.map((o) => o.id);
}

async function defaultQueryConversationRollup(
  orgIds: string[],
  periodStart: Date,
): Promise<ConversationRollupRow[]> {
  if (orgIds.length === 0) return [];
  const rows = await db
    .select({
      orgId: agentConversations.orgId,
      conversations: sql<number>`count(*)::int`,
      tokensIn: sql<number>`coalesce(sum(${agentConversations.tokensIn}), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${agentConversations.tokensOut}), 0)::int`,
      llmCostCents: sql<number>`coalesce(sum(${agentConversations.llmCostCents}), 0)::int`,
    })
    .from(agentConversations)
    .where(
      and(
        inArray(agentConversations.orgId, orgIds),
        gte(agentConversations.startedAt, periodStart),
      ),
    )
    .groupBy(agentConversations.orgId);

  return rows.map((r) => ({
    orgId: r.orgId,
    conversations: Number(r.conversations ?? 0),
    tokensIn: Number(r.tokensIn ?? 0),
    tokensOut: Number(r.tokensOut ?? 0),
    llmCostCents: Number(r.llmCostCents ?? 0),
  }));
}

/** READ-ONLY sum of metered voice debits from wallet_transactions
 *  (idempotency_key LIKE 'voice:%'). This module never writes wallet_accounts
 *  or wallet_transactions — see wallet-store.ts for the append-only ledger
 *  this reads from. amountMicros → cents: micros are $1 = 1_000_000, so
 *  cents = micros / 10_000. */
async function defaultQueryVoiceSpendCents(
  orgIds: string[],
  periodStart: Date,
): Promise<VoiceSpendRow[]> {
  if (orgIds.length === 0) return [];
  const rows = await db
    .select({
      orgId: walletTransactions.orgId,
      micros: sql<number>`coalesce(sum(${walletTransactions.amountMicros}), 0)`,
    })
    .from(walletTransactions)
    .where(
      and(
        inArray(walletTransactions.orgId, orgIds),
        like(walletTransactions.idempotencyKey, "voice:%"),
        gte(walletTransactions.createdAt, periodStart),
      ),
    )
    .groupBy(walletTransactions.orgId);

  return rows.map((r) => ({
    orgId: r.orgId,
    cents: Math.round(Number(r.micros ?? 0) / 10_000),
  }));
}

export function defaultUsageRollupDeps(): UsageRollupDeps {
  return {
    countedSubAccountOrgIds: defaultCountedSubAccountOrgIds,
    queryConversationRollup: defaultQueryConversationRollup,
    queryVoiceSpendCents: defaultQueryVoiceSpendCents,
  };
}

/** Resolve the counted sub-account set for `userId`, then ONE grouped
 *  conversation-rollup query + ONE grouped voice-spend query for that set
 *  (no N+1) → per-org usage rows + summed totals. Empty sub-account set short-
 *  circuits before either query. An org present in the counted set but absent
 *  from a query's result reads as a zeroed row (never omitted — the operator
 *  should see every client, including ones with zero usage this period). */
export async function getAgencyUsageRollup(
  userId: string,
  now: Date = new Date(),
  deps: UsageRollupDeps = defaultUsageRollupDeps(),
): Promise<UsageRollup> {
  const periodStart = currentPeriodStartUtc(now);
  const orgIds = await deps.countedSubAccountOrgIds(userId);

  if (orgIds.length === 0) {
    return {
      perOrg: [],
      totals: { conversations: 0, tokensIn: 0, tokensOut: 0, estCostCents: 0, voiceSpendCents: 0 },
    };
  }

  const [conversationRows, voiceRows] = await Promise.all([
    deps.queryConversationRollup(orgIds, periodStart),
    deps.queryVoiceSpendCents(orgIds, periodStart),
  ]);

  const conversationByOrg = new Map(conversationRows.map((r) => [r.orgId, r]));
  const voiceByOrg = new Map(voiceRows.map((r) => [r.orgId, r.cents]));

  const perOrg: OrgUsageRow[] = orgIds.map((orgId) => {
    const c = conversationByOrg.get(orgId);
    return {
      orgId,
      conversations: c?.conversations ?? 0,
      tokensIn: c?.tokensIn ?? 0,
      tokensOut: c?.tokensOut ?? 0,
      estCostCents: c?.llmCostCents ?? 0,
      voiceSpendCents: voiceByOrg.get(orgId) ?? 0,
    };
  });

  const totals = perOrg.reduce<UsageRollupTotals>(
    (acc, row) => ({
      conversations: acc.conversations + row.conversations,
      tokensIn: acc.tokensIn + row.tokensIn,
      tokensOut: acc.tokensOut + row.tokensOut,
      estCostCents: acc.estCostCents + row.estCostCents,
      voiceSpendCents: acc.voiceSpendCents + row.voiceSpendCents,
    }),
    { conversations: 0, tokensIn: 0, tokensOut: 0, estCostCents: 0, voiceSpendCents: 0 },
  );

  return { perOrg, totals };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The pinned per-client usage line (spec D2 — every cost figure is labeled
 *  "estimated"). Pure formatting, no I/O. Voice spend (when nonzero) appends
 *  a second, separately-labeled line. */
export function formatUsageLine(row: OrgUsageRow): string {
  const totalTokens = row.tokensIn + row.tokensOut;
  const convoWord = row.conversations === 1 ? "conversation" : "conversations";
  const base = `${row.conversations.toLocaleString("en-US")} ${convoWord} · ${totalTokens.toLocaleString("en-US")} tokens · ~${formatCents(row.estCostCents)} estimated AI cost this month — billed by your provider at their rates.`;

  if (row.voiceSpendCents > 0) {
    return `${base} Metered voice: ~${formatCents(row.voiceSpendCents)} estimated this month — billed by your provider at their rates.`;
  }

  return base;
}
