// Deterministic replay — ops CLI for the trace -> skill -> enable loop
// (Reelier phase 2c). This is OPS TOOLING run by the platform owner with
// direct DB env — NOT an in-app admin surface. There is no logged-in org to
// scope anything to here; direct DB access IS the authorization boundary,
// same as running SQL by hand. Per command:
//   - `list-traces` / `list-skills`: intentionally cross-org (no filter
//     unless `--org`/`--deployment` is passed).
//   - `compile`: looks up the trace row by id, then derives orgId +
//     deploymentId FROM that row and passes them into compileSkillFromTrace
//     (which enforces its own org-scoped WHERE) — so a compile always
//     targets the trace's OWN org, never an argument a caller could spoof.
//   - `enable` / `disable`: act by skillId ALONE (no org check at all) —
//     the operator running this script with direct DB env is already
//     trusted with every row in the database, so there is no org boundary
//     left to enforce.
//
// Usage (from packages/crm):
//   pnpm tsx scripts/replay-ops.ts list-traces [--org <id>] [--deployment <id>] [--limit N]
//   pnpm tsx scripts/replay-ops.ts show-trace <traceId>
//   pnpm tsx scripts/replay-ops.ts compile <traceId>
//   pnpm tsx scripts/replay-ops.ts list-skills [--deployment <id>]
//   pnpm tsx scripts/replay-ops.ts enable <skillId> [--filter '<json>']
//   pnpm tsx scripts/replay-ops.ts disable <skillId>
//   pnpm tsx scripts/replay-ops.ts set-filter <skillId> --filter '<json>'
//
// --filter is a JSON object of {senderEndsWith?, senderContains?,
// subjectContains?} (all provided conditions AND-matched, case-insensitive)
// or the literal string "null" to CLEAR a skill's filter. Validated with
// lib/deployments/replay/trigger-filter.ts's validateTriggerFilter — same
// function attemptL0Replay uses at replay time, so a filter that passes
// here is guaranteed to parse there too.
//
// DB-connection pattern mirrors scripts/validate-brain-v2.ts: load
// .env(.local) candidates via dotenv (override:false — never clobbers an
// already-exported env var), then hard-fail with a clear message (never a
// raw stack trace) if DATABASE_URL still isn't set.
import path from "node:path";
import { config as loadDotenv } from "dotenv";

function loadEnvironment() {
  const cwd = process.cwd();
  const parent = path.resolve(cwd, "..");
  const grandParent = path.resolve(cwd, "..", "..");
  const candidates = [
    path.join(cwd, ".env.local"),
    path.join(cwd, ".env"),
    path.join(parent, ".env.local"),
    path.join(parent, ".env"),
    path.join(grandParent, ".env.local"),
    path.join(grandParent, ".env"),
    path.join(cwd, "packages", "crm", ".env"),
    path.join(cwd, "packages", "crm", ".env.local"),
  ];
  for (const envPath of Array.from(new Set(candidates))) {
    loadDotenv({ path: envPath, override: false });
  }
}

type Args = {
  command: string | undefined;
  positional: string[];
  flags: Record<string, string>;
};

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok.startsWith("--")) {
      const name = tok.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[name] = next;
        i++;
      } else {
        flags[name] = "true";
      }
    } else {
      positional.push(tok);
    }
  }
  return { command, positional, flags };
}

function truncate(value: unknown, max = 120): string {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str === undefined) return "undefined";
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

/** True iff `err` is a Postgres unique-constraint violation (code 23505).
 *  Same check as lib/agents/lifecycle/supervised-run.ts's
 *  isUniqueViolationError / lib/agents/message-trigger-storage-drizzle.ts's
 *  isUniqueViolation — reimplemented locally (not imported) because those
 *  modules' own contracts are about a different domain (supervised runs /
 *  message triggers); this is a one-line, dependency-free check. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { code?: string }).code === "23505";
}

async function cmdListTraces(flags: Record<string, string>) {
  const { db } = await import("@/db");
  const { agentWorkflowTraces } = await import("@/db/schema/agent-workflow-traces");
  const { and, eq, desc } = await import("drizzle-orm");

  const conditions = [];
  if (flags.org) conditions.push(eq(agentWorkflowTraces.orgId, flags.org));
  if (flags.deployment) conditions.push(eq(agentWorkflowTraces.deploymentId, flags.deployment));
  const limit = flags.limit ? Number.parseInt(flags.limit, 10) : 25;

  let query = db
    .select({
      id: agentWorkflowTraces.id,
      orgId: agentWorkflowTraces.orgId,
      deploymentId: agentWorkflowTraces.deploymentId,
      kind: agentWorkflowTraces.kind,
      ok: agentWorkflowTraces.ok,
      callCount: agentWorkflowTraces.callCount,
      createdAt: agentWorkflowTraces.createdAt,
    })
    .from(agentWorkflowTraces)
    .orderBy(desc(agentWorkflowTraces.createdAt))
    .limit(Number.isFinite(limit) && limit > 0 ? limit : 25);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const rows = await query;
  if (rows.length === 0) {
    console.log("No traces found.");
    return;
  }
  console.log(`${rows.length} trace(s):\n`);
  for (const row of rows) {
    console.log(
      `${row.id}  org=${row.orgId}  deployment=${row.deploymentId ?? "-"}  kind=${row.kind}  ok=${row.ok}  calls=${row.callCount}  ${row.createdAt.toISOString()}`,
    );
  }
}

async function cmdShowTrace(traceId: string | undefined) {
  if (!traceId) {
    console.error("usage: show-trace <traceId>");
    process.exitCode = 1;
    return;
  }
  const { db } = await import("@/db");
  const { agentWorkflowTraces } = await import("@/db/schema/agent-workflow-traces");
  const { redact } = await import("@/lib/deployments/replay/trace-format");
  const { eq } = await import("drizzle-orm");
  const [row] = await db
    .select()
    .from(agentWorkflowTraces)
    .where(eq(agentWorkflowTraces.id, traceId))
    .limit(1);
  if (!row) {
    console.error(`trace not found: ${traceId}`);
    process.exitCode = 1;
    return;
  }

  console.log(`trace ${row.id}`);
  console.log(`  org: ${row.orgId}`);
  console.log(`  deployment: ${row.deploymentId ?? "-"}`);
  console.log(`  kind: ${row.kind}  ok: ${row.ok}  calls: ${row.callCount}`);
  console.log(`  started: ${row.startedAt.toISOString()}  finished: ${row.finishedAt.toISOString()}`);
  console.log("");

  // Belt-and-suspenders: re-redact on the way OUT too, in case this row
  // predates a redaction fix (e.g. the query-param masking added alongside
  // this CLI) — a trace written before a hardening pass must never leak a
  // secret through `show-trace` just because it slipped past write-time
  // redaction.
  const records = Array.isArray(row.records) ? row.records : [];
  for (const rec of records as Array<Record<string, unknown>>) {
    const safe = redact(rec) as Record<string, unknown>;
    if (safe.t === "note") {
      console.log(`  [${safe.seq}] note: ${truncate(safe.text, 200)}`);
    } else if (safe.t === "call") {
      console.log(`  [${safe.seq}] call#${safe.i} ${safe.tool}  args=${truncate(safe.args)}`);
    } else if (safe.t === "result") {
      console.log(`  [${safe.seq}] result#${safe.i} ok=${safe.ok} ms=${safe.ms}  body=${truncate(safe.body)}`);
    } else if (safe.t === "meta") {
      console.log(`  [${safe.seq}] meta name=${safe.name} wrapped=${truncate(safe.wrapped)}`);
    } else {
      // A 'replay-run' (ReelierRunRecord) row — not a TraceRecord[] shape.
      // Print it redacted-whole rather than assuming per-record fields.
      console.log(`  ${truncate(safe)}`);
    }
  }
}

async function cmdCompile(traceId: string | undefined) {
  if (!traceId) {
    console.error("usage: compile <traceId>");
    process.exitCode = 1;
    return;
  }
  const { db } = await import("@/db");
  const { agentWorkflowTraces } = await import("@/db/schema/agent-workflow-traces");
  const { compileSkillFromTrace } = await import("@/lib/deployments/replay/compile");
  const { effectForTool } = await import("@/lib/deployments/replay/tool-effects");
  const { eq } = await import("drizzle-orm");

  const [row] = await db
    .select({
      id: agentWorkflowTraces.id,
      orgId: agentWorkflowTraces.orgId,
      deploymentId: agentWorkflowTraces.deploymentId,
    })
    .from(agentWorkflowTraces)
    .where(eq(agentWorkflowTraces.id, traceId))
    .limit(1);
  if (!row) {
    console.error(`trace not found: ${traceId}`);
    process.exitCode = 1;
    return;
  }
  if (!row.deploymentId) {
    console.error(`trace ${traceId} has no deployment_id — nothing to compile a skill against`);
    process.exitCode = 1;
    return;
  }

  const result = await compileSkillFromTrace(row.orgId, row.deploymentId, traceId);
  if (!result) {
    console.error(`compile failed: trace ${traceId} not found under its own org/deployment scope`);
    process.exitCode = 1;
    return;
  }

  console.log(`draft skill id: ${result.skillRow.id}  (status: ${result.skillRow.status})`);
  console.log("");
  console.log("--- skill_md ---");
  console.log(result.skillRow.skillMd);
  console.log("--- end skill_md ---");

  const nonReadSteps = result.compiled.steps.filter((s) => effectForTool(s.tool) !== "read");
  if (nonReadSteps.length > 0) {
    console.log("");
    console.log(
      `WARNING: ${nonReadSteps.length} step(s) use a tool NOT allowlisted 'read' — the replay gate will only ` +
        `ever run this skill if ALL of these are the SINGLE FINAL step:`,
    );
    for (const s of nonReadSteps) {
      const known = effectForTool(s.tool);
      const label = known ? known : "UNKNOWN (not in tool-effects.ts allowlist — treated as destructive)";
      console.log(`  step ${s.n} "${s.title}": tool=${s.tool} -> ${label}`);
    }
  }
}

async function cmdListSkills(flags: Record<string, string>) {
  const { db } = await import("@/db");
  const { replaySkills } = await import("@/db/schema/replay-skills");
  const { eq, desc } = await import("drizzle-orm");

  let query = db
    .select({
      id: replaySkills.id,
      deploymentId: replaySkills.deploymentId,
      name: replaySkills.name,
      status: replaySkills.status,
      healCount: replaySkills.healCount,
      lastReplayAt: replaySkills.lastReplayAt,
      triggerFilter: replaySkills.triggerFilter,
    })
    .from(replaySkills)
    .orderBy(desc(replaySkills.createdAt));

  if (flags.deployment) {
    query = query.where(eq(replaySkills.deploymentId, flags.deployment)) as typeof query;
  }

  const rows = await query;
  if (rows.length === 0) {
    console.log("No skills found.");
    return;
  }
  console.log(`${rows.length} skill(s):\n`);
  for (const row of rows) {
    console.log(
      `${row.id}  deployment=${row.deploymentId}  name=${row.name ?? "-"}  status=${row.status}  heals=${row.healCount}  lastReplay=${row.lastReplayAt ? row.lastReplayAt.toISOString() : "-"}  filter=${row.triggerFilter ? truncate(row.triggerFilter, 200) : "-"}`,
    );
  }
}

/** Parse + strictly validate a `--filter` CLI flag value with the SAME
 *  validator attemptL0Replay uses at replay time. The literal string
 *  "null" clears the filter. Returns null and prints an error (caller sets
 *  exitCode) on any parse/validation failure — never throws. */
async function parseFilterFlag(
  raw: string,
): Promise<{ ok: true; filter: import("@/lib/deployments/replay/trigger-filter").TriggerFilter | null } | { ok: false }> {
  const { validateTriggerFilter } = await import("@/lib/deployments/replay/trigger-filter");
  if (raw.trim() === "null") return { ok: true, filter: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`--filter is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false };
  }
  const validated = validateTriggerFilter(parsed);
  if (!validated.ok) {
    console.error(`--filter rejected: ${validated.error}`);
    return { ok: false };
  }
  return { ok: true, filter: validated.filter };
}

async function cmdSetFilter(skillId: string | undefined, flags: Record<string, string>) {
  if (!skillId || !flags.filter) {
    console.error("usage: set-filter <skillId> --filter '<json>' (or --filter 'null' to clear)");
    process.exitCode = 1;
    return;
  }
  const parsed = await parseFilterFlag(flags.filter);
  if (!parsed.ok) {
    process.exitCode = 1;
    return;
  }

  const { db } = await import("@/db");
  const { replaySkills } = await import("@/db/schema/replay-skills");
  const { eq } = await import("drizzle-orm");

  const [skill] = await db
    .select({ id: replaySkills.id, deploymentId: replaySkills.deploymentId })
    .from(replaySkills)
    .where(eq(replaySkills.id, skillId))
    .limit(1);
  if (!skill) {
    console.error(`skill not found: ${skillId}`);
    process.exitCode = 1;
    return;
  }

  await db
    .update(replaySkills)
    .set({ triggerFilter: parsed.filter, updatedAt: new Date() })
    .where(eq(replaySkills.id, skillId));
  console.log(
    `${skillId}: trigger_filter -> ${parsed.filter ? JSON.stringify(parsed.filter) : "null"}  (deployment ${skill.deploymentId})`,
  );
}

async function setSkillStatus(
  skillId: string | undefined,
  status: "enabled" | "disabled",
  flags: Record<string, string> = {},
) {
  if (!skillId) {
    console.error(`usage: ${status === "enabled" ? "enable" : "disable"} <skillId>`);
    process.exitCode = 1;
    return;
  }

  // Optional `--filter` on `enable` — validated with the SAME function
  // attemptL0Replay uses at replay time, checked BEFORE any DB write so an
  // invalid --filter never partially enables a skill.
  let triggerFilter: import("@/lib/deployments/replay/trigger-filter").TriggerFilter | null | undefined;
  if (status === "enabled" && flags.filter) {
    const parsed = await parseFilterFlag(flags.filter);
    if (!parsed.ok) {
      process.exitCode = 1;
      return;
    }
    triggerFilter = parsed.filter;
  }

  const { db } = await import("@/db");
  const { replaySkills } = await import("@/db/schema/replay-skills");
  const { eq } = await import("drizzle-orm");

  const [skill] = await db
    .select({ id: replaySkills.id, deploymentId: replaySkills.deploymentId, status: replaySkills.status })
    .from(replaySkills)
    .where(eq(replaySkills.id, skillId))
    .limit(1);
  if (!skill) {
    console.error(`skill not found: ${skillId}`);
    process.exitCode = 1;
    return;
  }

  try {
    await db
      .update(replaySkills)
      .set({
        status,
        updatedAt: new Date(),
        // Only touch trigger_filter when --filter was actually passed —
        // an `enable` with no --filter leaves whatever's already stored
        // (e.g. a filter set earlier via set-filter, or null from a fresh
        // compile) untouched.
        ...(triggerFilter !== undefined ? { triggerFilter } : {}),
      })
      .where(eq(replaySkills.id, skillId));
    console.log(
      `${skillId}: ${skill.status} -> ${status}  (deployment ${skill.deploymentId})` +
        (triggerFilter !== undefined ? `  filter -> ${triggerFilter ? JSON.stringify(triggerFilter) : "null"}` : ""),
    );
  } catch (err) {
    if (status === "enabled" && isUniqueViolation(err)) {
      console.error(
        `cannot enable ${skillId}: another skill is already enabled for deployment ${skill.deploymentId} ` +
          `(replay_skills_one_enabled_per_deployment_idx — at most one enabled skill per deployment). ` +
          `Disable the currently-enabled skill first, then retry.`,
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

async function main() {
  loadEnvironment();

  if (!process.env.DATABASE_URL) {
    console.error(
      "No database configured: DATABASE_URL is not set. Load .env/.env.local (or export DATABASE_URL) before running replay-ops.",
    );
    process.exitCode = 1;
    return;
  }

  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "list-traces":
      await cmdListTraces(flags);
      break;
    case "show-trace":
      await cmdShowTrace(positional[0]);
      break;
    case "compile":
      await cmdCompile(positional[0]);
      break;
    case "list-skills":
      await cmdListSkills(flags);
      break;
    case "enable":
      await setSkillStatus(positional[0], "enabled", flags);
      break;
    case "disable":
      await setSkillStatus(positional[0], "disabled");
      break;
    case "set-filter":
      await cmdSetFilter(positional[0], flags);
      break;
    default:
      console.error(
        "usage: replay-ops.ts <list-traces|show-trace|compile|list-skills|enable|disable|set-filter> [args]\n\n" +
          "  list-traces [--org <id>] [--deployment <id>] [--limit N]\n" +
          "  show-trace <traceId>\n" +
          "  compile <traceId>\n" +
          "  list-skills [--deployment <id>]\n" +
          "  enable <skillId> [--filter '<json>']\n" +
          "  disable <skillId>\n" +
          "  set-filter <skillId> --filter '<json>'",
      );
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  console.error("replay-ops failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
