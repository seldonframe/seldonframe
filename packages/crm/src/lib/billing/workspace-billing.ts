// packages/crm/src/lib/billing/workspace-billing.ts
//
// Phase 4 (2026-06-18 pricing migration) — per-active-workspace billing.
//
// The Agency tier ($297/mo base) includes 10 client workspaces and bills
// $10/mo for each LIVE client workspace beyond that, via a
// quantity-licensed Stripe subscription item (price
// AGENCY_WORKSPACE_OVERAGE_PRICE_ID). This module keeps that item's
// quantity in sync with reality.
//
// ── "Active workspace" — the definition (investigated, real columns) ──
//
// An ACTIVE agency workspace is a child organization that is:
//   1. ATTACHED to the agency — organizations.parent_agency_id points at
//      a partner_agencies row the agency org owns. The agency org → its
//      partner_agencies rows is resolved exactly like
//      lib/billing/orgs.ts::fetchAgencyAttachedWorkspaceIds: by the
//      owning user (partner_agencies.owner_user_id = the agency org's
//      owner) OR the polymorphic workspace owner
//      (partner_agencies.owner_workspace_id = the agency org id, for the
//      anonymous-workspace-as-agency path).
//   2. PUBLISHED / live to the public — it has at least one landing_pages
//      row with status='published' (the same predicate the public page
//      route + getPublicLandingPage use). A workspace that exists but has
//      never published anything isn't billable client work yet.
//   3. NOT archived / suspended — workspaces have NO soft-archive column;
//      they are HARD-DELETED (the orphan-TTL cron and DELETE
//      /api/v1/workspaces/[id] both `db.delete(organizations)`). So
//      "archived" == "row gone", which naturally drops out of the COUNT.
//      The one org-level billing-gated lifecycle flag is
//      organizations.preview_mode (proposal-provisioned, gated from
//      billing until the prospect accepts) — those are EXCLUDED.
//
// The SQL that encodes (1)+(2)+(3) lives in
// `loadActiveAgencyWorkspaceCount` below; tests inject
// `deps.queryActiveWorkspaceCount` to stay DB-free.
//
// ── Idempotency ──
// We persist BOTH the overage item id (stripeWorkspaceItemId, set by the
// Phase 2 webhook OR by the first create here) AND the last-synced
// quantity (stripeWorkspaceItemQuantity). The sync compares the target
// against the last-synced quantity and SKIPS the Stripe call when they're
// equal — so the nightly reconcile cron is a cheap no-op in steady state.
//
// ── Safety ──
// Every Stripe call is wrapped: a failure logs + the function returns
// { action: "error" } but NEVER throws. Callers (publish/archive hooks,
// the cron) treat this as best-effort; the nightly reconcile is the
// safety net.

import Stripe from "stripe";
import { and, eq, exists, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations, partnerAgencies, users, type OrganizationSubscription } from "@/db/schema";
import { AGENCY_WORKSPACE_OVERAGE_PRICE_ID } from "@/lib/billing/price-ids";
import { normalizeTierId } from "@/lib/billing/features";
import { getOrgSubscription as getOrgSubscriptionDb, updateOrgSubscription as updateOrgSubscriptionDb } from "@/lib/billing/subscription";

/** Default included client workspaces before overage billing kicks in. */
export const DEFAULT_INCLUDED_WORKSPACES = 10;

/** The narrow Stripe surface this module needs. Real callers pass the
 *  Stripe SDK (which structurally satisfies this); tests pass a fake.
 *  Methods mirror stripe.subscriptionItems.{create,update,del}. */
export interface StripeSubscriptionItemsClient {
  subscriptionItems: {
    create(params: {
      subscription: string;
      price: string;
      quantity: number;
    }): Promise<{ id: string }>;
    update(itemId: string, params: { quantity: number }): Promise<{ id: string }>;
    del(itemId: string): Promise<unknown>;
  };
}

/** Injected dependencies for {@link syncAgencyWorkspaceQuantity}. Real
 *  callers omit these and get the DB + env-Stripe production wiring via
 *  {@link resolveDeps}. */
export interface WorkspaceBillingDeps {
  /** Count of the agency's ACTIVE (published, non-preview) child
   *  workspaces. Backed by `loadActiveAgencyWorkspaceCount` in prod. */
  queryActiveWorkspaceCount: (agencyOrgId: string) => Promise<number>;
  getOrgSubscription: (orgId: string) => Promise<OrganizationSubscription>;
  updateOrgSubscription: (
    orgId: string,
    updates: Partial<OrganizationSubscription>
  ) => Promise<void>;
  /** Stripe client (or null when STRIPE_SECRET_KEY is unset → no-op). */
  stripe: StripeSubscriptionItemsClient | null;
  /** The $10 quantity-licensed overage price id. Env-only; "" → no-op. */
  overagePriceId: string;
}

/** Subset of deps {@link countActiveAgencyWorkspaces} needs. */
export type CountDeps = Pick<WorkspaceBillingDeps, "queryActiveWorkspaceCount">;

// ─── pure math ───────────────────────────────────────────────────────

/** Billable overage = max(0, active − included). `included` defaults to
 *  {@link DEFAULT_INCLUDED_WORKSPACES} when null/undefined. */
export function workspaceOverageQuantity(
  activeCount: number,
  includedWorkspaces: number | null | undefined
): number {
  const included =
    typeof includedWorkspaces === "number" && Number.isFinite(includedWorkspaces)
      ? includedWorkspaces
      : DEFAULT_INCLUDED_WORKSPACES;
  return Math.max(0, Math.floor(activeCount) - included);
}

// ─── production DB readers (omitted in tests) ─────────────────────────

let cachedStripe: Stripe | null = null;
/** Lazily build the Stripe client from the env secret key (same source
 *  as checkout + the webhook). Returns null when the key is unset so the
 *  whole sync becomes a safe no-op. NEVER hard-codes a key. */
export function getBillingStripeClient(): Stripe | null {
  if (cachedStripe) return cachedStripe;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  cachedStripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
  return cachedStripe;
}

/**
 * Count the agency org's ACTIVE child workspaces (see the file header for
 * the full "active" definition). One SQL statement:
 *
 *   SELECT count(*) FROM organizations o
 *   WHERE o.preview_mode = false
 *     AND o.parent_agency_id IN (
 *       SELECT id FROM partner_agencies pa
 *       WHERE pa.owner_user_id = <agency owner> OR pa.owner_workspace_id = <agencyOrgId>
 *     )
 *     AND EXISTS (
 *       SELECT 1 FROM landing_pages lp
 *       WHERE lp.org_id = o.id AND lp.status = 'published'
 *     )
 *
 * The agency owner is resolved from the agency org's own
 * owner_id/parent_user_id. We also accept the polymorphic
 * owner_workspace_id = agencyOrgId path (anonymous-workspace-as-agency).
 */
export async function loadActiveAgencyWorkspaceCount(agencyOrgId: string): Promise<number> {
  // Resolve the agency org's owning user so we can find the
  // partner_agencies rows it owns (mirrors fetchAgencyAttachedWorkspaceIds).
  const [agencyOrg] = await db
    .select({ ownerId: organizations.ownerId, parentUserId: organizations.parentUserId })
    .from(organizations)
    .where(eq(organizations.id, agencyOrgId))
    .limit(1);

  const ownerUserId = agencyOrg?.ownerId ?? agencyOrg?.parentUserId ?? null;

  // partner_agencies owned by this agency (by user OR by workspace).
  const ownedAgencyIds = await db
    .select({ id: partnerAgencies.id })
    .from(partnerAgencies)
    .where(
      ownerUserId
        ? sql`${partnerAgencies.ownerUserId} = ${ownerUserId} OR ${partnerAgencies.ownerWorkspaceId} = ${agencyOrgId}`
        : eq(partnerAgencies.ownerWorkspaceId, agencyOrgId)
    );

  if (ownedAgencyIds.length === 0) return 0;
  const agencyIds = ownedAgencyIds.map((a) => a.id);

  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(organizations)
    .where(
      and(
        // attached to one of this agency's partner_agencies rows
        sql`${organizations.parentAgencyId} = ANY(${agencyIds})`,
        // not proposal-provisioned (billing-gated)
        eq(organizations.previewMode, false),
        // front-office bridge: archived client workspaces must NOT count toward
        // the agency's billed workspace quantity (excluded from the overage sync)
        isNull(organizations.archivedAt),
        // published / live to the public
        exists(
          db
            .select({ one: sql`1` })
            .from(landingPages)
            .where(
              and(
                eq(landingPages.orgId, organizations.id),
                eq(landingPages.status, "published")
              )
            )
        )
      )
    );

  const count = Math.max(0, Number(row?.value ?? 0));
  return Number.isNaN(count) ? 0 : count;
}

/** Build the production deps: DB-backed readers + env Stripe client. */
function resolveDeps(overrides: Partial<WorkspaceBillingDeps> = {}): WorkspaceBillingDeps {
  return {
    queryActiveWorkspaceCount: overrides.queryActiveWorkspaceCount ?? loadActiveAgencyWorkspaceCount,
    getOrgSubscription: overrides.getOrgSubscription ?? getOrgSubscriptionDb,
    updateOrgSubscription: overrides.updateOrgSubscription ?? updateOrgSubscriptionDb,
    stripe: overrides.stripe !== undefined ? overrides.stripe : getBillingStripeClient(),
    overagePriceId: overrides.overagePriceId ?? AGENCY_WORKSPACE_OVERAGE_PRICE_ID,
  };
}

// ─── public API ───────────────────────────────────────────────────────

/**
 * Count an agency org's ACTIVE child workspaces (published + not
 * archived/preview). Tests inject `deps.queryActiveWorkspaceCount`; real
 * callers omit deps and hit `loadActiveAgencyWorkspaceCount`.
 *
 * Returns 0 for a null/empty org id WITHOUT querying.
 */
export async function countActiveAgencyWorkspaces(
  agencyOrgId: string | null | undefined,
  deps: Partial<CountDeps> = {}
): Promise<number> {
  if (!agencyOrgId) return 0;
  const query = deps.queryActiveWorkspaceCount ?? loadActiveAgencyWorkspaceCount;
  return query(agencyOrgId);
}

export type SyncResult = {
  /**
   *  - "created": created a new overage item (target>0, none existed)
   *  - "updated": updated an existing item's quantity (target changed)
   *  - "noop":    nothing to do (quantity already correct / 0 with no item)
   *  - "skipped": preconditions not met (not agency, no sub, no price, no
   *               Stripe client, or null org id) — never touched Stripe
   *  - "error":   a Stripe call threw and was swallowed
   */
  action: "created" | "updated" | "noop" | "skipped" | "error";
  /** The computed target overage quantity (max(0, active − included)). */
  quantity: number;
};

/**
 * Reconcile the agency's Stripe overage subscription-item quantity with
 * the live count of active client workspaces. Idempotent + best-effort
 * (never throws). See the file header for the full contract.
 *
 * Preconditions (any failing → { action: "skipped" }, no Stripe call):
 *   - non-null org id
 *   - subscription tier resolves to "agency"
 *   - an active stripeSubscriptionId is present
 *   - the overage price id is configured (env-only)
 *   - a Stripe client is available (STRIPE_SECRET_KEY set)
 */
export async function syncAgencyWorkspaceQuantity(
  agencyOrgId: string | null | undefined,
  deps: Partial<WorkspaceBillingDeps> = {}
): Promise<SyncResult> {
  if (!agencyOrgId) return { action: "skipped", quantity: 0 };

  const d = resolveDeps(deps);

  const subscription = await d.getOrgSubscription(agencyOrgId);

  // Gate: must be an Agency org with an active platform subscription.
  if (normalizeTierId(subscription.tier) !== "agency") {
    return { action: "skipped", quantity: 0 };
  }
  const subscriptionId = subscription.stripeSubscriptionId;
  if (!subscriptionId) {
    return { action: "skipped", quantity: 0 };
  }
  // The overage price + a Stripe client are both required to do anything.
  if (!d.overagePriceId || !d.stripe) {
    return { action: "skipped", quantity: 0 };
  }

  const activeCount = await d.queryActiveWorkspaceCount(agencyOrgId);
  const target = workspaceOverageQuantity(activeCount, subscription.includedWorkspaces);

  const itemId = subscription.stripeWorkspaceItemId ?? null;
  const lastQuantity = subscription.stripeWorkspaceItemQuantity ?? null;

  // ── Case A: no overage item yet ─────────────────────────────────────
  if (!itemId) {
    if (target <= 0) {
      // Nothing to bill and nothing to create — steady state for an
      // agency under its included allotment.
      return { action: "noop", quantity: 0 };
    }
    try {
      const created = await d.stripe.subscriptionItems.create({
        subscription: subscriptionId,
        price: d.overagePriceId,
        quantity: target,
      });
      await d.updateOrgSubscription(agencyOrgId, {
        stripeWorkspaceItemId: created.id,
        stripeWorkspaceItemQuantity: target,
      });
      return { action: "created", quantity: target };
    } catch (err) {
      logStripeFailure("create", agencyOrgId, subscriptionId, err);
      return { action: "error", quantity: target };
    }
  }

  // ── Case B: item exists ─────────────────────────────────────────────
  // Idempotent skip: only call Stripe when the target differs from the
  // last quantity we synced. (lastQuantity null = unknown → always sync
  // once so we converge after the webhook created the item.)
  if (lastQuantity !== null && lastQuantity === target) {
    return { action: "noop", quantity: target };
  }

  try {
    await d.stripe.subscriptionItems.update(itemId, { quantity: target });
    await d.updateOrgSubscription(agencyOrgId, {
      stripeWorkspaceItemQuantity: target,
    });
    return { action: "updated", quantity: target };
  } catch (err) {
    logStripeFailure("update", agencyOrgId, subscriptionId, err);
    return { action: "error", quantity: target };
  }
}

function logStripeFailure(
  op: "create" | "update" | "del",
  orgId: string,
  subscriptionId: string,
  err: unknown
): void {
  console.error(
    `[billing.workspace-billing] Stripe subscriptionItems.${op} failed for agencyOrg=${orgId} sub=${subscriptionId}: ${
      err instanceof Error ? err.message : String(err)
    }`
  );
}

// ─── live-sync helpers (publish / archive hooks) ──────────────────────

/**
 * Resolve a CHILD workspace's parent AGENCY ORG id — the org whose
 * `organizations.subscription` carries the agency's Stripe subscription
 * + overage item. The chain is:
 *
 *   childOrg.parent_agency_id → partner_agencies row → owner
 *     → owner_user_id  → that user's primary org (users.org_id)
 *     → owner_workspace_id → that workspace IS the agency org
 *
 * Returns null when the workspace isn't attached to an agency, or the
 * agency's billing org can't be resolved. Best-effort: any DB hiccup
 * resolves to null (the caller is fire-and-forget; the nightly reconcile
 * is the safety net).
 */
export async function resolveParentAgencyOrgId(
  childOrgId: string | null | undefined
): Promise<string | null> {
  if (!childOrgId) return null;
  try {
    const [child] = await db
      .select({ parentAgencyId: organizations.parentAgencyId })
      .from(organizations)
      .where(eq(organizations.id, childOrgId))
      .limit(1);
    if (!child?.parentAgencyId) return null;

    const [agency] = await db
      .select({
        ownerUserId: partnerAgencies.ownerUserId,
        ownerWorkspaceId: partnerAgencies.ownerWorkspaceId,
      })
      .from(partnerAgencies)
      .where(eq(partnerAgencies.id, child.parentAgencyId))
      .limit(1);
    if (!agency) return null;

    // Polymorphic ownership: the anonymous-workspace-as-agency path means
    // the agency org IS the owner workspace.
    if (agency.ownerWorkspaceId) return agency.ownerWorkspaceId;

    // Otherwise the agency's billing org is the owning user's primary org.
    if (agency.ownerUserId) {
      const [owner] = await db
        .select({ orgId: users.orgId })
        .from(users)
        .where(eq(users.id, agency.ownerUserId))
        .limit(1);
      return owner?.orgId ?? null;
    }
    return null;
  } catch (err) {
    console.error(
      `[billing.workspace-billing] resolveParentAgencyOrgId failed for child=${childOrgId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

/**
 * Fire-and-forget: when a CHILD workspace is published or archived/
 * deleted, re-sync its parent agency's overage quantity. Resolves the
 * parent agency org first; no-op when the workspace isn't agency-managed.
 *
 * Wrapped so it NEVER throws into the request path — publish/archive must
 * succeed regardless of billing-sync outcome. The nightly reconcile cron
 * corrects any drift if this best-effort call fails or is skipped.
 */
export async function syncWorkspaceBillingForChild(
  childOrgId: string | null | undefined
): Promise<void> {
  try {
    const agencyOrgId = await resolveParentAgencyOrgId(childOrgId);
    if (!agencyOrgId) return;
    await syncAgencyWorkspaceQuantity(agencyOrgId);
  } catch (err) {
    // Belt-and-suspenders: syncAgencyWorkspaceQuantity already swallows
    // Stripe errors, but guard the whole resolve+sync so a publish never
    // 500s on a billing hiccup.
    console.error(
      `[billing.workspace-billing] syncWorkspaceBillingForChild failed for child=${childOrgId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
