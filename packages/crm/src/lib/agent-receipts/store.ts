// Agent receipts slice (Task 3) — the DB-backed loaders feeding the activity
// page's "Agent runs" section and the per-deployment LIVE banner. Design:
// docs/superpowers/specs/2026-07-16-agent-receipts-design.md.
//
// Org-scoped (L-04): every query below is filtered by org_id (or, for
// getDeploymentLiveStatus, by builderOrgId/clientOrgId on the deployment) —
// no cross-org leakage. Plain lib module (NOT "use server") — read-only,
// touches the DB directly like the sibling activity-store.ts.

import { and, desc, eq, gte, or } from "drizzle-orm";
import { db } from "@/db";
import { agentRunReceipts, type AgentRunReceiptToolCall, type AgentRunReceiptTriggerKind, type AgentRunReceiptStatus } from "@/db/schema/agent-run-receipts";
import { deployments } from "@/db/schema/deployments";
import { agentTemplates } from "@/db/schema/agent-templates";
import { COMPOSIO_CONNECTED_ACCOUNT_ID_KEY } from "@/lib/deployments/store";
import { summarizeDeploymentLiveStatus, type DeploymentLiveStatus } from "./live-status";

export type AgentRunReceiptViewRow = {
  id: string;
  when: string;
  deploymentId: string | null;
  /** The client this run was for, when resolvable (deployment's
   *  clientName) — "—" for a self-deployment / no matching deployment. */
  agentLabel: string;
  triggerKind: AgentRunReceiptTriggerKind;
  sourceRef: string | null;
  status: AgentRunReceiptStatus;
  summary: string;
  toolCalls: AgentRunReceiptToolCall[];
};

const DEFAULT_RECEIPTS_WINDOW_DAYS = 7;

/**
 * Load this org's recent agent-run receipts, newest first, within the
 * trailing `windowDays`. Org-scoped by `org_id` directly (the receipt row
 * itself carries it — no join needed for the scope check).
 */
export async function loadAgentRunReceipts(
  orgId: string,
  limit = 50,
  windowDays: number = DEFAULT_RECEIPTS_WINDOW_DAYS,
): Promise<AgentRunReceiptViewRow[]> {
  if (!orgId) return [];
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: agentRunReceipts.id,
      createdAt: agentRunReceipts.createdAt,
      deploymentId: agentRunReceipts.deploymentId,
      clientName: deployments.clientName,
      triggerKind: agentRunReceipts.triggerKind,
      sourceRef: agentRunReceipts.sourceRef,
      status: agentRunReceipts.status,
      summary: agentRunReceipts.summary,
      toolCalls: agentRunReceipts.toolCalls,
    })
    .from(agentRunReceipts)
    .leftJoin(deployments, eq(agentRunReceipts.deploymentId, deployments.id))
    .where(and(eq(agentRunReceipts.orgId, orgId), gte(agentRunReceipts.createdAt, since)))
    .orderBy(desc(agentRunReceipts.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    when: r.createdAt.toISOString(),
    deploymentId: r.deploymentId,
    agentLabel: r.clientName?.trim() || "—",
    triggerKind: r.triggerKind as AgentRunReceiptTriggerKind,
    sourceRef: r.sourceRef,
    status: r.status as AgentRunReceiptStatus,
    summary: r.summary,
    toolCalls: (r.toolCalls as AgentRunReceiptToolCall[] | null) ?? [],
  }));
}

/**
 * Compose the per-deployment LIVE banner view model: is it active, what
 * trigger kind is it running on (read off the most recent receipt — cheaper
 * than re-resolving the template's blueprint), how many runs fired today,
 * and when the last one was. Org-scoped: `orgId` must match the
 * deployment's builderOrgId OR clientOrgId, else this returns null exactly
 * like "deployment not found" (never leaks another org's deployment).
 * Returns null when the deployment doesn't exist / isn't in this org — the
 * caller renders nothing in that case (design: "if no deployment exists
 * render nothing").
 */
export async function getDeploymentLiveStatus(
  deploymentId: string,
  orgId: string,
): Promise<DeploymentLiveStatus | null> {
  if (!deploymentId || !orgId) return null;

  const [dep] = await db
    .select({
      status: deployments.status,
      customization: deployments.customization,
    })
    .from(deployments)
    .where(
      and(
        eq(deployments.id, deploymentId),
        or(eq(deployments.builderOrgId, orgId), eq(deployments.clientOrgId, orgId)),
      ),
    )
    .limit(1);
  if (!dep) return null;

  const receiptRows = await db
    .select({
      createdAt: agentRunReceipts.createdAt,
      triggerKind: agentRunReceipts.triggerKind,
    })
    .from(agentRunReceipts)
    .where(eq(agentRunReceipts.deploymentId, deploymentId))
    .orderBy(desc(agentRunReceipts.createdAt))
    .limit(200);

  const customization = dep.customization as Record<string, unknown> | null;
  const connectedAccountLabel = customization?.[COMPOSIO_CONNECTED_ACCOUNT_ID_KEY] ?? null;

  return summarizeDeploymentLiveStatus({
    deploymentStatus: dep.status,
    triggerKind: (receiptRows[0]?.triggerKind as AgentRunReceiptTriggerKind | undefined) ?? null,
    receiptCreatedAtIso: receiptRows.map((r) => r.createdAt.toISOString()),
    nowMs: Date.now(),
    connectedAccountLabel: typeof connectedAccountLabel === "string" ? connectedAccountLabel : null,
  });
}

/** One row for the /automations "Your agents" strip (Task 3, P4-lite). */
export type DeployedAgentStripRow = {
  deploymentId: string;
  templateId: string;
  agentName: string;
  triggerKind: AgentRunReceiptTriggerKind | null;
  active: boolean;
};

/**
 * Agent truth slice (2026-07-16, Task 3) — every deployment THIS org can see
 * (as builder OR client — mirrors `getDeploymentLiveStatus`'s own org-scope
 * OR, so a client workspace sees agents deployed TO it and a builder
 * workspace sees agents it deployed), joined to its template's name.
 *
 * The live dot + trigger-kind chip are REUSED from `getDeploymentLiveStatus`
 * (never a second status-deriving implementation) — one extra query per
 * deployment, acceptable for a compact strip (this org's own deployment
 * count, not a global list). Org-scoped: the join's `WHERE` only ever
 * matches deployments where this org is builder or client; `orgId` is passed
 * straight through to `getDeploymentLiveStatus` too, so a row can never leak
 * another org's deployment status.
 */
export async function loadDeployedAgentsForStrip(orgId: string): Promise<DeployedAgentStripRow[]> {
  if (!orgId) return [];

  const rows = await db
    .select({
      deploymentId: deployments.id,
      templateId: deployments.agentTemplateId,
      agentName: agentTemplates.name,
    })
    .from(deployments)
    .innerJoin(agentTemplates, eq(deployments.agentTemplateId, agentTemplates.id))
    .where(or(eq(deployments.builderOrgId, orgId), eq(deployments.clientOrgId, orgId)))
    .orderBy(desc(deployments.updatedAt));

  return Promise.all(
    rows.map(async (row): Promise<DeployedAgentStripRow> => {
      const status = await getDeploymentLiveStatus(row.deploymentId, orgId);
      return {
        deploymentId: row.deploymentId,
        templateId: row.templateId,
        agentName: row.agentName,
        triggerKind: status?.triggerKind ?? null,
        active: status?.active ?? false,
      };
    }),
  );
}
