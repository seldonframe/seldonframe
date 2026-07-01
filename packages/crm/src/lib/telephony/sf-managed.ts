// packages/crm/src/lib/telephony/sf-managed.ts
//
// Tier-0 subaccount layer (spec 2026-07-01-voice-deploy-metered-billing §3).
// One Twilio SUBACCOUNT per builder-org, isolated for billing rollup + a
// one-API-call suspend/reactivate rail, with its own Elastic SIP Trunk
// pointed at SF's shared OpenAI SIP endpoint.
//
// INERT WITHOUT MASTER CREDS: every exported function that talks to Twilio
// checks resolveMasterTwilio(env) (or, for the trunk helper, the subaccount
// creds it was explicitly handed) FIRST and returns `not_configured` / no-ops
// with ZERO Twilio calls when the required creds/env aren't present. Max
// enters TWILIO_MASTER_ACCOUNT_SID / TWILIO_MASTER_AUTH_TOKEN /
// OPENAI_SIP_ORIGINATION_URI in Vercel; until then this module never reaches
// the network.
//
// Persistence mirrors the BYO-Twilio pattern in lib/telephony/config.ts +
// lib/integrations/actions.ts: read organizations.integrations (jsonb),
// mutate a typed sub-blob (here: `sfTelephony`), write back via
// db.update(organizations).set({ integrations, updatedAt }). The authToken is
// encrypted with the SAME "v1." scheme (encryptValue/decryptValue from
// lib/encryption.ts) as BYO Twilio — no new crypto.
//
// All I/O is behind DI (SfManagedDeps) so the pure orchestration is unit
// tested with fakes (tests/unit/telephony/sf-managed.spec.ts) — zero network,
// zero DB. buildSfManagedDeps() wires the real Twilio clients + org store for
// production callers (Task 6 provisioning, the webhook's onShortfall hook,
// the top-up reactivate hook).

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, type OrganizationIntegrations } from "@/db/schema";
import { decryptValue, encryptValue } from "@/lib/encryption";
import { createTwilioTelephonyClient, type TwilioTelephonyClient } from "./twilio-client";

type Env = Record<string, string | undefined>;

// ─── resolveMasterTwilio ────────────────────────────────────────────────────────

/**
 * Both TWILIO_MASTER_ACCOUNT_SID and TWILIO_MASTER_AUTH_TOKEN present
 * (non-blank) → the master creds object. Either missing/blank → null, which
 * is the module's INERT signal: every function below checks this (or is
 * hard-parameterized with subaccount creds by its caller) before making any
 * Twilio call.
 */
export function resolveMasterTwilio(env: Env): { accountSid: string; authToken: string } | null {
  const accountSid = env.TWILIO_MASTER_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_MASTER_AUTH_TOKEN?.trim();

  if (!accountSid || !authToken) {
    return null;
  }

  return { accountSid, authToken };
}

// ─── pickTrunkWithOrigination (PURE) ───────────────────────────────────────────

/**
 * Find the trunkSid whose originationUris list contains `uri` EXACTLY
 * (no substring/prefix matching — a stray extra character must not match).
 * First match wins when multiple trunks qualify. No match / empty list → null.
 */
export function pickTrunkWithOrigination(
  trunks: Array<{ trunkSid: string; originationUris: string[] }>,
  uri: string,
): string | null {
  const found = trunks.find((t) => t.originationUris.includes(uri));
  return found?.trunkSid ?? null;
}

// ─── Deps (DI seam) ─────────────────────────────────────────────────────────────

export type SfTelephonyIntegration = {
  subaccountSid: string;
  /** Encrypted at rest ("v1." scheme, same as BYO Twilio's authToken). */
  authToken: string;
  trunkSid?: string;
};

export type SfManagedDeps = {
  env: Env;
  /**
   * Reads an org's integrations jsonb blob (or {} if not found / empty).
   * Keyed by an opaque lookup id: `ensureBuilderSubaccount` calls this with
   * the org's own UUID (the normal row lookup); `ensureSubaccountTrunk` calls
   * it with the subaccount's Twilio sid (a reverse jsonb lookup on
   * `sfTelephony->>'subaccountSid'` — same idiom this codebase already uses
   * for `subscription->>'stripeCustomerId'` in the Stripe webhook, since that
   * function only receives subCreds, not the orgId). The real store
   * (buildSfManagedDeps) implements both lookups; fakes in tests just need to
   * honor whatever id they're given.
   */
  getOrgIntegrations(lookupId: string): Promise<{ sfTelephony?: SfTelephonyIntegration } & Record<string, unknown>>;
  /** Shallow-merges `patch` into the same row resolved by getOrgIntegrations and persists it. */
  patchOrgIntegrations(lookupId: string, patch: { sfTelephony?: SfTelephonyIntegration }): Promise<void>;
  /** MASTER-creds Twilio client — subaccount CRUD (create/find/suspend/reactivate). */
  masterClient: Pick<
    TwilioTelephonyClient,
    "createSubaccount" | "findSubaccountByFriendlyName" | "setSubaccountStatus"
  >;
  /** Builds a Twilio client scoped to arbitrary (typically subaccount) creds — trunk ops. */
  subClientFor(creds: {
    accountSid: string;
    authToken: string;
  }): Pick<TwilioTelephonyClient, "listTrunksWithOrigination" | "createTrunkWithOrigination">;
};

// ─── ensureBuilderSubaccount ────────────────────────────────────────────────────

export type EnsureBuilderSubaccountResult =
  | { ok: true; subaccountSid: string; authToken: string }
  | { ok: false; error: "not_configured" | "twilio_error" };

/**
 * Idempotent: (1) already-persisted integrations.sfTelephony → return it
 * decrypted, zero Twilio calls; (2) else findSubaccountByFriendlyName(orgId)
 * → persist (encrypted) + return; (3) else createSubaccount → persist
 * (encrypted) + return. No master creds → not_configured, zero calls (the
 * module's core inertness guarantee). Any Twilio-client throw is caught and
 * mapped to `twilio_error` — this function never throws.
 *
 * FriendlyName = the orgId itself (spec §3), so subaccount lookup is a
 * direct, collision-free filter — no derived/slugified name to keep in sync.
 */
export async function ensureBuilderSubaccount(
  orgId: string,
  deps: SfManagedDeps,
): Promise<EnsureBuilderSubaccountResult> {
  const existing = (await deps.getOrgIntegrations(orgId)).sfTelephony;
  if (existing?.subaccountSid && existing.authToken) {
    return {
      ok: true,
      subaccountSid: existing.subaccountSid,
      authToken: decryptStoredToken(existing.authToken),
    };
  }

  const master = resolveMasterTwilio(deps.env);
  if (!master) {
    return { ok: false, error: "not_configured" };
  }

  try {
    const found = await deps.masterClient.findSubaccountByFriendlyName?.({ friendlyName: orgId });
    if (found) {
      await persistSfTelephony(deps, orgId, { subaccountSid: found.sid, authToken: found.authToken });
      return { ok: true, subaccountSid: found.sid, authToken: found.authToken };
    }

    const created = await deps.masterClient.createSubaccount?.({ friendlyName: orgId });
    if (!created) {
      // Neither optional method is wired on this masterClient — treat as a
      // configuration gap, not a network failure.
      return { ok: false, error: "not_configured" };
    }

    await persistSfTelephony(deps, orgId, { subaccountSid: created.sid, authToken: created.authToken });
    return { ok: true, subaccountSid: created.sid, authToken: created.authToken };
  } catch {
    return { ok: false, error: "twilio_error" };
  }
}

// ─── ensureSubaccountTrunk ──────────────────────────────────────────────────────

export type EnsureSubaccountTrunkResult =
  | { ok: true; trunkSid: string }
  | { ok: false; error: "not_configured" | "twilio_error" };

/**
 * Runs on a client built with the SUBACCOUNT's own creds — the
 * trunking.twilio.com subdomain rejects master creds for a subaccount's
 * trunks. Idempotent: persisted trunkSid → return it, zero calls; else list
 * the subaccount's trunks and reuse one whose origination list already
 * contains OPENAI_SIP_ORIGINATION_URI (pickTrunkWithOrigination); else create
 * one. Missing env URI → not_configured, zero calls. Any throw → twilio_error
 * (never propagates).
 *
 * Takes ONLY subCreds (no orgId) per the plan's signature — the persisted
 * trunkSid is looked up via the reverse jsonb lookup keyed by
 * subCreds.subaccountSid (getOrgIntegrations/patchOrgIntegrations accept any
 * lookup id; buildSfManagedDeps resolves this one via
 * `sfTelephony->>'subaccountSid'`, same idiom as the Stripe webhook's
 * `subscription->>'stripeCustomerId'` reverse lookup).
 */
export async function ensureSubaccountTrunk(
  subCreds: { subaccountSid: string; authToken: string },
  deps: SfManagedDeps,
): Promise<EnsureSubaccountTrunkResult> {
  const originationSipUri = deps.env.OPENAI_SIP_ORIGINATION_URI?.trim();
  if (!originationSipUri) {
    return { ok: false, error: "not_configured" };
  }

  const lookupId = subCreds.subaccountSid;
  const existing = (await deps.getOrgIntegrations(lookupId)).sfTelephony;
  if (existing?.trunkSid) {
    return { ok: true, trunkSid: existing.trunkSid };
  }

  try {
    const client = deps.subClientFor({ accountSid: subCreds.subaccountSid, authToken: subCreds.authToken });

    const trunks = await client.listTrunksWithOrigination?.();
    const reusable = trunks ? pickTrunkWithOrigination(trunks, originationSipUri) : null;

    if (reusable) {
      await persistSfTelephony(deps, lookupId, { subaccountSid: subCreds.subaccountSid, trunkSid: reusable });
      return { ok: true, trunkSid: reusable };
    }

    const created = await client.createTrunkWithOrigination?.({
      friendlyName: `sf-managed-${subCreds.subaccountSid}`,
      originationSipUri,
    });
    if (!created) {
      return { ok: false, error: "not_configured" };
    }

    await persistSfTelephony(deps, lookupId, { subaccountSid: subCreds.subaccountSid, trunkSid: created.trunkSid });
    return { ok: true, trunkSid: created.trunkSid };
  } catch {
    return { ok: false, error: "twilio_error" };
  }
}

// ─── suspend / reactivateBuilderSubaccount ─────────────────────────────────────

/**
 * Fail-soft: NEVER throws. No-ops (zero Twilio calls) when there's no master
 * creds or no persisted subaccount for this org — a suspend/reactivate call
 * fired from a metering hook must never crash the caller.
 */
export async function suspendBuilderSubaccount(orgId: string, deps: SfManagedDeps): Promise<void> {
  await setStatusFailSoft(orgId, deps, "suspended");
}

export async function reactivateBuilderSubaccount(orgId: string, deps: SfManagedDeps): Promise<void> {
  await setStatusFailSoft(orgId, deps, "active");
}

async function setStatusFailSoft(
  orgId: string,
  deps: SfManagedDeps,
  status: "suspended" | "active" | "closed",
): Promise<void> {
  try {
    const master = resolveMasterTwilio(deps.env);
    if (!master) return;

    const existing = (await deps.getOrgIntegrations(orgId)).sfTelephony;
    if (!existing?.subaccountSid) return;

    await deps.masterClient.setSubaccountStatus?.({ subaccountSid: existing.subaccountSid, status });
  } catch {
    // fail-soft — never let a suspend/reactivate call crash its caller
    // (metering hook, top-up webhook, etc.)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function decryptStoredToken(stored: string): string {
  if (!stored.startsWith("v1.")) {
    return stored;
  }
  try {
    return decryptValue(stored);
  } catch {
    return "";
  }
}

async function persistSfTelephony(
  deps: SfManagedDeps,
  orgId: string,
  patch: Partial<SfTelephonyIntegration> & { subaccountSid: string },
): Promise<void> {
  const current = (await deps.getOrgIntegrations(orgId)).sfTelephony;

  const next: SfTelephonyIntegration = {
    subaccountSid: patch.subaccountSid,
    authToken:
      patch.authToken !== undefined
        ? encryptValue(patch.authToken)
        : current?.authToken ?? "",
    ...(patch.trunkSid !== undefined ? { trunkSid: patch.trunkSid } : current?.trunkSid ? { trunkSid: current.trunkSid } : {}),
  };

  await deps.patchOrgIntegrations(orgId, { sfTelephony: next });
}

// ─── Real-deps builder (production wiring) ─────────────────────────────────────

// organizations.id is a Postgres uuid(); Twilio Account sids always start
// with "AC". This discriminates the two lookup-id shapes getOrgIntegrations/
// patchOrgIntegrations receive (see SfManagedDeps doc comment): the org's own
// UUID (ensureBuilderSubaccount) vs. its subaccount's Twilio sid
// (ensureSubaccountTrunk, which never receives an orgId).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function orgRowFilter(lookupId: string) {
  if (UUID_RE.test(lookupId)) {
    return eq(organizations.id, lookupId);
  }
  // Reverse jsonb lookup — same idiom as the Stripe webhook's
  // `subscription->>'stripeCustomerId'` (app/api/webhooks/stripe-billing/route.ts).
  return sql`${organizations.integrations}->'sfTelephony'->>'subaccountSid' = ${lookupId}`;
}

/**
 * Wires the real Twilio clients + org store for production callers (Task 6
 * provisioning, the metering webhook's onShortfall hook, the top-up
 * reactivate hook). Constructs the master client lazily from
 * resolveMasterTwilio(env) — if creds are absent, masterClient methods are
 * simply never invoked because every exported function checks
 * resolveMasterTwilio first (or, for ensureSubaccountTrunk, is handed
 * explicit subaccount creds by its caller).
 */
export function buildSfManagedDeps(env: Env = process.env): SfManagedDeps {
  const master = resolveMasterTwilio(env);
  const masterClient = master ? createTwilioTelephonyClient(master) : createTwilioTelephonyClient({ accountSid: "", authToken: "" });

  return {
    env,
    async getOrgIntegrations(lookupId: string) {
      const [org] = await db
        .select({ integrations: organizations.integrations })
        .from(organizations)
        .where(orgRowFilter(lookupId))
        .limit(1);

      const integrations = (org?.integrations ?? {}) as OrganizationIntegrations;

      return integrations;
    },
    async patchOrgIntegrations(lookupId: string, patch: { sfTelephony?: SfTelephonyIntegration }) {
      const [org] = await db
        .select({ id: organizations.id, integrations: organizations.integrations })
        .from(organizations)
        .where(orgRowFilter(lookupId))
        .limit(1);

      if (!org) {
        // Nothing to patch — the caller (ensureSubaccountTrunk) resolved this
        // lookupId from a subaccountSid it just got back from
        // ensureBuilderSubaccount in the same request, so this should not
        // happen in practice; fail closed rather than writing an orphan row.
        throw new Error(`sf-managed: patchOrgIntegrations found no org for lookupId=${lookupId}`);
      }

      const integrations = (org.integrations ?? {}) as OrganizationIntegrations;

      const merged = { ...integrations, ...patch };

      await db
        .update(organizations)
        .set({ integrations: merged, updatedAt: new Date() })
        .where(eq(organizations.id, org.id));
    },
    masterClient,
    subClientFor(creds: { accountSid: string; authToken: string }) {
      return createTwilioTelephonyClient(creds);
    },
  };
}
