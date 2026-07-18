// Inbound-chain dead-man's switch (roadmap #7, 2026-07-18).
//
// WHY: on 2026-07-16 the email-agent chain died silently for 2 days
// (deployments got canceled upstream; nobody noticed until traces were
// missing). This module is the daily check that would have caught it —
// for every ACTIVE email-surface deployment, has it produced ANY
// agent_workflow_traces row (kind='trace' or 'replay-run' — "any kind" per
// the roadmap item) in the last 24h?
//
// Status per deployment:
//   'ok'     — activity (a trace/replay-run row) within the last 24h.
//   'silent' — has activity historically, but none in the last 24h. This is
//              the alertable state (the exact shape of the 2026-07-16 incident).
//   'never'  — active deployment, zero rows EVER. Informational only — a
//              brand-new deployment that hasn't received its first inbound
//              email yet looks identical to a dead one on day 0, so this
//              status is never treated as alertable (see computeHeartbeat).
//
// DI pattern mirrors ledger-queries.ts in this same directory: the pure
// math (computeHeartbeat) takes already-loaded rows and a clock, no I/O; the
// DB wrapper (getHeartbeat) does the real reads via injectable fetch fns
// (each defaulting to a lazy `@/db` import, kept out of the top-level import
// graph so this module stays test-friendly without a DB).
//
// PLATFORM-OPERATOR SCOPE: unlike every other read in ledger-queries.ts,
// this module is NOT org-scoped by design — the caller (the cron route) is
// a platform-operator job that sweeps every org, not a per-org dashboard
// read. There is no request-supplied orgId anywhere in this file (L-04 is
// about never trusting a client-supplied org id; a platform cron with no
// request-scoped org has nothing to trust wrongly). See the cron route's
// header for the same note next to its auth check.

export type HeartbeatDeploymentStatus = "ok" | "silent" | "never";

export type HeartbeatDeploymentRow = {
  deploymentId: string;
  clientName: string;
  orgId: string;
  orgName: string | null;
  /** Latest agent_workflow_traces.created_at for this deployment, across
   *  every kind. `null` = this deployment has never produced a row. */
  lastActivityAt: Date | null;
};

export type HeartbeatDeploymentResult = HeartbeatDeploymentRow & {
  status: HeartbeatDeploymentStatus;
  /** Hours since lastActivityAt. `null` when lastActivityAt is null
   *  (status === 'never'). */
  hoursSinceActivity: number | null;
};

export type HeartbeatResult = {
  deployments: HeartbeatDeploymentResult[];
  /** Count of status === 'silent' rows — the ONLY status that should ever
   *  trigger the alert email. 'never' rows are informational (see header). */
  silentCount: number;
  /** Global signal: the most recent agent_run_receipts.created_at across ALL
   *  orgs. Included per the roadmap item ("Also global: last receipt age")
   *  as a second, coarser sanity check independent of the per-deployment
   *  trace table. `null` = no receipts have ever been written. */
  lastReceiptAt: Date | null;
  generatedAt: Date;
};

export const HEARTBEAT_SILENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Pure: no I/O, no Date.now() — `now` is always passed in so tests are
 *  deterministic and the 24h boundary is exercisable exactly. */
export function computeHeartbeat(
  rows: HeartbeatDeploymentRow[],
  now: Date,
  lastReceiptAt: Date | null,
): HeartbeatResult {
  const deployments: HeartbeatDeploymentResult[] = rows.map((row) => {
    if (!row.lastActivityAt) {
      return { ...row, status: "never", hoursSinceActivity: null };
    }
    const ageMs = now.getTime() - row.lastActivityAt.getTime();
    const status: HeartbeatDeploymentStatus = ageMs <= HEARTBEAT_SILENT_THRESHOLD_MS ? "ok" : "silent";
    return { ...row, status, hoursSinceActivity: ageMs / (60 * 60 * 1000) };
  });

  return {
    deployments,
    silentCount: deployments.filter((d) => d.status === "silent").length,
    lastReceiptAt,
    generatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// DB wrapper
// ---------------------------------------------------------------------------

export type HeartbeatDeps = {
  /** ACTIVE email-surface deployments, one row per deployment, with org
   *  identity attached. No lastActivityAt — that's filled in separately
   *  (see fetchLastActivityByDeployment) so this fetch stays a simple join. */
  fetchActiveEmailDeployments?: () => Promise<
    Omit<HeartbeatDeploymentRow, "lastActivityAt">[]
  >;
  /** Latest agent_workflow_traces.created_at per deployment id, for exactly
   *  the deployment ids passed in. Missing ids in the returned map mean
   *  "never had a row" (status 'never'), not zero rows fetched. */
  fetchLastActivityByDeployment?: (deploymentIds: string[]) => Promise<Map<string, Date>>;
  /** Global max(agent_run_receipts.created_at) across all orgs. */
  fetchGlobalLastReceiptAt?: () => Promise<Date | null>;
  now?: () => Date;
};

async function defaultFetchActiveEmailDeployments(): Promise<
  Omit<HeartbeatDeploymentRow, "lastActivityAt">[]
> {
  const { db } = await import("@/db");
  const { deployments } = await import("@/db/schema/deployments");
  const { organizations } = await import("@/db/schema/organizations");
  const { and, eq } = await import("drizzle-orm");
  const rows = await db
    .select({
      deploymentId: deployments.id,
      clientName: deployments.clientName,
      orgId: deployments.builderOrgId,
      orgName: organizations.name,
    })
    .from(deployments)
    .leftJoin(organizations, eq(deployments.builderOrgId, organizations.id))
    .where(and(eq(deployments.status, "active"), eq(deployments.surface, "email")));
  return rows.map((r) => ({
    deploymentId: r.deploymentId,
    clientName: r.clientName,
    orgId: r.orgId,
    orgName: r.orgName ?? null,
  }));
}

async function defaultFetchLastActivityByDeployment(deploymentIds: string[]): Promise<Map<string, Date>> {
  const result = new Map<string, Date>();
  if (deploymentIds.length === 0) return result;

  const { db } = await import("@/db");
  const { agentWorkflowTraces } = await import("@/db/schema/agent-workflow-traces");
  const { inArray, sql } = await import("drizzle-orm");
  const rows = await db
    .select({
      deploymentId: agentWorkflowTraces.deploymentId,
      lastAt: sql<Date>`max(${agentWorkflowTraces.createdAt})`,
    })
    .from(agentWorkflowTraces)
    .where(inArray(agentWorkflowTraces.deploymentId, deploymentIds))
    .groupBy(agentWorkflowTraces.deploymentId);

  for (const row of rows) {
    if (row.deploymentId && row.lastAt) {
      result.set(row.deploymentId, new Date(row.lastAt));
    }
  }
  return result;
}

async function defaultFetchGlobalLastReceiptAt(): Promise<Date | null> {
  const { db } = await import("@/db");
  const { agentRunReceipts } = await import("@/db/schema/agent-run-receipts");
  const { sql } = await import("drizzle-orm");
  const [row] = await db
    .select({ lastAt: sql<Date | null>`max(${agentRunReceipts.createdAt})` })
    .from(agentRunReceipts);
  return row?.lastAt ? new Date(row.lastAt) : null;
}

/** Platform-operator read — sweeps every org's active email deployments.
 *  See the header note: intentionally NOT org-scoped, called only from the
 *  authenticated cron route. */
export async function getHeartbeat(deps: HeartbeatDeps = {}): Promise<HeartbeatResult> {
  const fetchActiveEmailDeployments = deps.fetchActiveEmailDeployments ?? defaultFetchActiveEmailDeployments;
  const fetchLastActivityByDeployment = deps.fetchLastActivityByDeployment ?? defaultFetchLastActivityByDeployment;
  const fetchGlobalLastReceiptAt = deps.fetchGlobalLastReceiptAt ?? defaultFetchGlobalLastReceiptAt;
  const now = deps.now ?? (() => new Date());

  const deploymentsWithoutActivity = await fetchActiveEmailDeployments();
  const [activityByDeployment, lastReceiptAt] = await Promise.all([
    fetchLastActivityByDeployment(deploymentsWithoutActivity.map((d) => d.deploymentId)),
    fetchGlobalLastReceiptAt(),
  ]);

  const rows: HeartbeatDeploymentRow[] = deploymentsWithoutActivity.map((d) => ({
    ...d,
    lastActivityAt: activityByDeployment.get(d.deploymentId) ?? null,
  }));

  return computeHeartbeat(rows, now(), lastReceiptAt);
}
