"use server";

import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { brainEvents } from "@/db/schema";
import { runSeldonItAction, type SeldonRunState } from "@/lib/ai/seldon-actions";
import { listManagedOrganizations } from "@/lib/billing/orgs";
import { requireManagedWorkspaceForUser } from "@/lib/openclaw/self-service";

const ACTIVITY_EVENT_TYPES = ["seldon_it_applied", "openclaw_scope_denied"] as const;

function hashWorkspaceId(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export type ClientWithActivity = {
  id: string;
  name: string;
  slug: string;
  soulId: string | null;
  createdAt: string;
  contactCount: number;
  activity: {
    seldon_it_applied: number;
    openclaw_scope_denied: number;
    last_event_at: string | null;
  };
};

/**
 * Builder-facing overview of every workspace the user manages, enriched with
 * recent Seldon It and scope-denial activity pulled from Brain v2.
 *
 * Activity window is the last 30 days by default — enough for an agency to
 * see which clients are alive without flooding the overview.
 */
export async function listClientsWithActivity(
  userId: string,
  options: { activityDays?: number } = {}
): Promise<ClientWithActivity[]> {
  const activityDays = options.activityDays ?? 30;
  const workspaces = await listManagedOrganizations(userId);
  if (workspaces.length === 0) {
    return [];
  }

  const since = new Date(Date.now() - activityDays * 24 * 60 * 60 * 1000);
  const hashToOrg = new Map<string, (typeof workspaces)[number]>();
  for (const org of workspaces) {
    hashToOrg.set(hashWorkspaceId(org.id), org);
  }
  const hashes = Array.from(hashToOrg.keys());

  const rows = await db
    .select({
      workspaceId: brainEvents.workspaceId,
      eventType: brainEvents.eventType,
      count: sql<number>`count(*)`,
      lastAt: sql<Date>`max(${brainEvents.timestamp})`,
    })
    .from(brainEvents)
    .where(
      and(
        inArray(brainEvents.workspaceId, hashes),
        inArray(brainEvents.eventType, ACTIVITY_EVENT_TYPES as unknown as string[]),
        gte(brainEvents.timestamp, since)
      )
    )
    .groupBy(brainEvents.workspaceId, brainEvents.eventType);

  type Stats = ClientWithActivity["activity"];
  const statsByOrgId = new Map<string, Stats>();

  for (const row of rows) {
    const org = hashToOrg.get(row.workspaceId);
    if (!org) continue;
    const current: Stats = statsByOrgId.get(org.id) ?? {
      seldon_it_applied: 0,
      openclaw_scope_denied: 0,
      last_event_at: null,
    };

    if (row.eventType === "seldon_it_applied") {
      current.seldon_it_applied = Number(row.count);
    } else if (row.eventType === "openclaw_scope_denied") {
      current.openclaw_scope_denied = Number(row.count);
    }

    const lastAtIso = row.lastAt ? new Date(row.lastAt).toISOString() : null;
    if (lastAtIso && (!current.last_event_at || lastAtIso > current.last_event_at)) {
      current.last_event_at = lastAtIso;
    }

    statsByOrgId.set(org.id, current);
  }

  return workspaces.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    soulId: org.soulId ?? null,
    createdAt: new Date(org.createdAt).toISOString(),
    contactCount: org.contactCount,
    activity:
      statsByOrgId.get(org.id) ?? {
        seldon_it_applied: 0,
        openclaw_scope_denied: 0,
        last_event_at: null,
      },
  }));
}

export type PropagationInput = {
  workspaceIds: string[];
  description: string;
  sessionIdPrefix?: string;
};

export type PerWorkspaceResult = {
  workspaceId: string;
  slug: string | null;
  name: string | null;
  ok: boolean;
  message?: string;
  error?: string;
  sessionId?: string;
  results: SeldonRunState["results"];
};

export type PropagationOutcome = {
  requested: number;
  succeeded: number;
  failed: number;
  results: PerWorkspaceResult[];
};

/**
 * Apply the same natural-language change across multiple managed workspaces.
 *
 * Each workspace is verified independently via `requireManagedWorkspaceForUser`.
 * The change rides through the normal `runSeldonItAction` pipeline with
 * `target_org_id` set — so it respects every existing guardrail
 * (plan gating, writable assertion, block installer, Brain events, etc.)
 * and nothing in the workspace-level logic needs to change.
 *
 * Results are independent per workspace: one failure does not block the others.
 */
export async function propagateSeldonChangeToWorkspaces(
  userId: string,
  input: PropagationInput
): Promise<PropagationOutcome> {
  const description = input.description.trim();
  if (!description) {
    throw new Error("description is required");
  }

  const uniqueIds = Array.from(new Set(input.workspaceIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    throw new Error("workspaceIds must contain at least one id");
  }

  const results: PerWorkspaceResult[] = [];
  for (const workspaceId of uniqueIds) {
    try {
      const workspace = await requireManagedWorkspaceForUser(workspaceId, userId);

      const formData = new FormData();
      formData.set("description", description);
      formData.set("target_org_id", workspace.id);
      formData.set("builder_mode", "true");
      if (input.sessionIdPrefix) {
        formData.set("sessionId", `${input.sessionIdPrefix}-${workspace.id}`);
      }

      const runState = await runSeldonItAction({ ok: false }, formData);
      results.push({
        workspaceId: workspace.id,
        slug: workspace.slug ?? null,
        name: workspace.name ?? null,
        ok: runState.ok,
        message: runState.message,
        error: runState.error,
        sessionId: runState.sessionId,
        results: runState.results ?? [],
      });
    } catch (error) {
      results.push({
        workspaceId,
        slug: null,
        name: null,
        ok: false,
        error: error instanceof Error ? error.message : "Propagation failed",
        results: [],
      });
    }
  }

  const succeeded = results.filter((entry) => entry.ok).length;

  return {
    requested: uniqueIds.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  };
}

/**
 * Latest scope-denied events across every managed workspace — helps builders
 * see what their clients asked for that got refused (material for turning
 * into reusable blocks later).
 */
export async function listRecentScopeDenials(userId: string, limit = 25) {
  const workspaces = await listManagedOrganizations(userId);
  if (workspaces.length === 0) {
    return [];
  }

  const hashToOrg = new Map<string, (typeof workspaces)[number]>();
  for (const org of workspaces) {
    hashToOrg.set(hashWorkspaceId(org.id), org);
  }
  const hashes = Array.from(hashToOrg.keys());

  const rows = await db
    .select({
      timestamp: brainEvents.timestamp,
      workspaceId: brainEvents.workspaceId,
      payload: brainEvents.payload,
    })
    .from(brainEvents)
    .where(and(inArray(brainEvents.workspaceId, hashes), eq(brainEvents.eventType, "openclaw_scope_denied")))
    .orderBy(desc(brainEvents.timestamp))
    .limit(Math.max(1, Math.min(limit, 100)));

  return rows.map((row) => {
    const org = hashToOrg.get(row.workspaceId);
    const payload = row.payload ?? {};
    return {
      at: new Date(row.timestamp).toISOString(),
      workspace: org
        ? { id: org.id, name: org.name, slug: org.slug }
        : { id: null, name: null, slug: null },
      category: typeof payload.category === "string" ? payload.category : null,
      matched: typeof payload.matched === "string" ? payload.matched : null,
      description_preview: typeof payload.description_preview === "string" ? payload.description_preview : null,
    };
  });
}
