// v1.28.1 — consolidated workspace-state endpoint
//
// Replaces 4-6 progressive MCP discovery calls with one. Returns
// everything Claude Code (or any client) needs to reason about a
// workspace's current state in a single round-trip:
//
//   - Workspace identity (id, name, slug, soul.industry, timezone)
//   - Integrations status (which LLM providers configured, which CRM
//     extras like Twilio/Resend are wired)
//   - Agents with INLINE health stats (status, version, eval pass rate,
//     validator pass rate 24h, conversations 24h)
//   - High-level counts (contacts, bookings, deals, agents)
//
// The MCP tool get_workspace_state wraps this. Every other discovery
// path (list_agents, get_agent_metrics, list of appointment types, etc.)
// remains available — this is sugar for the "what's in this workspace?"
// case which is overwhelmingly the most common question.

import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  agents,
  agentConversations,
  agentEvals,
  agentTurns,
  bookings,
  contacts,
  deals,
  organizations,
  workspaceSecrets,
} from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import { buildBuilderLadder, buildLifecycleView, deriveBuilderSignals } from "@/lib/build/builder-ladder";
import { loadAgentMarketplaceStatusForOrg } from "@/lib/marketplace/agent-marketplace-status";
import { getBuilderEarningsMicros, getWalletBalanceMicros, getWithdrawableEarningsMicros, resolveWalletStripeMode } from "@/lib/build/wallet-store";
import { isBillingEnabled } from "@/lib/marketplace/billing/billing-mode";
import { stripeConnections } from "@/db/schema";
import { MIN_WITHDRAW_USD } from "@/lib/build/payout";
// deploy_readiness (Task C3) — TEMPLATE-level readiness (no deployment
// required yet). Reuses the exact building blocks the impure
// resolveDeployReadiness (lib/deployments/deploy-readiness-deps.ts) composes
// for an existing deployment; here there is none, so wizardPath/progress are
// dropped rather than faked. See computeTemplateDeployReadiness below.
import { listAgentTemplates, surfaceForType, type AgentTemplateType } from "@/lib/agent-templates/store";
import { normalizeBlueprintForOnboarding, buildOnboardingSteps } from "@/lib/marketplace/onboarding/steps";
import { computeToolConnectionStatuses } from "@/lib/agents/mcp/tool-connection";
import { isBindingConnectedForOrg } from "@/lib/agents/mcp/binding-connection";
import { deploymentNeedsNumber } from "@/lib/deployments/margin";
import { resolveBuilderTelephony } from "@/lib/telephony/config";
import { computeDeployReadiness, type DeployReadiness } from "@/lib/deployments/deploy-readiness";
// Task 10 — Tier-0 (SF-managed, zero-connect) availability signal.
import { voiceManagedEnabled, TIER0_READY_FLOOR_MICROS } from "@/lib/telephony/voice-metering";
import { resolveMasterTwilio } from "@/lib/telephony/sf-managed";
// T10 review, F3 — per-deployment voice_billing (suspended/low_balance).
import { computeVoiceBillingSignal } from "@/lib/telephony/delinquency";
import { listActiveSfManagedDeploymentsForOrg } from "@/lib/deployments/store";
import type { AgentTemplate } from "@/db/schema/agent-templates";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const orgId = guard.orgId;
  const sinceTs = new Date(Date.now() - 24 * 3600 * 1000);

  // 1. Workspace identity
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      soul: organizations.soul,
      timezone: organizations.timezone,
      integrations: organizations.integrations,
      theme: organizations.theme,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json(
      { ok: false, error: "workspace_not_found" },
      { status: 404 },
    );
  }

  // 2. Integrations status — flag which providers are configured
  // WITHOUT exposing the encrypted keys themselves.
  const integrations = (org.integrations ?? {}) as Record<string, unknown>;
  function isConfigured(key: string): boolean {
    const entry = integrations[key];
    if (!entry || typeof entry !== "object") return false;
    const obj = entry as Record<string, unknown>;
    return Boolean(obj.apiKey || obj.accessToken || obj.token);
  }

  // 3. Agents with inline health stats
  const agentRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      channel: agents.channel,
      archetype: agents.archetype,
      status: agents.status,
      currentVersion: agents.currentVersion,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(eq(agents.orgId, orgId))
    .orderBy(desc(agents.createdAt));

  // Per-agent stats: 24h conversations + validator pass rate + latest
  // eval pass rate. Computed in parallel for speed.
  const agentStats = await Promise.all(
    agentRows.map(async (agent) => {
      const [convAgg] = await db
        .select({
          conversations: sql<number>`count(distinct ${agentConversations.id})`,
        })
        .from(agentConversations)
        .where(
          and(
            eq(agentConversations.agentId, agent.id),
            gte(agentConversations.startedAt, sinceTs),
            sql`(${agentConversations.channelMeta} ->> 'eval_run') IS DISTINCT FROM 'true'`,
          ),
        );

      const [validatorAgg] = await db
        .select({
          total: sql<number>`count(*)`,
          clean: sql<number>`count(*) filter (where not exists (select 1 from jsonb_array_elements(${agentTurns.validatorsPassed}) elem where (elem->>'passed')::boolean = false))`,
        })
        .from(agentTurns)
        .innerJoin(
          agentConversations,
          eq(agentConversations.id, agentTurns.conversationId),
        )
        .where(
          and(
            eq(agentConversations.agentId, agent.id),
            eq(agentTurns.role, "assistant"),
            gte(agentTurns.createdAt, sinceTs),
          ),
        );

      const evalRows = await db
        .select({
          scenarioId: agentEvals.scenarioId,
          passed: agentEvals.passed,
          ranAt: agentEvals.ranAt,
        })
        .from(agentEvals)
        .where(eq(agentEvals.agentId, agent.id))
        .orderBy(desc(agentEvals.ranAt))
        .limit(50);

      const latestByScenario = new Map<string, boolean | null>();
      let mostRecentRun: Date | null = null;
      for (const row of evalRows) {
        if (!latestByScenario.has(row.scenarioId)) {
          latestByScenario.set(row.scenarioId, row.passed);
          if (!mostRecentRun || row.ranAt > mostRecentRun)
            mostRecentRun = row.ranAt;
        }
      }
      const evalTotal = latestByScenario.size;
      const evalPassed = [...latestByScenario.values()].filter(
        (p) => p === true,
      ).length;

      return {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        channel: agent.channel,
        archetype: agent.archetype,
        status: agent.status,
        version: agent.currentVersion,
        created_at: agent.createdAt,
        updated_at: agent.updatedAt,
        stats: {
          conversations_24h: Number(convAgg?.conversations ?? 0),
          validator_pass_rate_24h:
            validatorAgg && validatorAgg.total > 0
              ? validatorAgg.clean / validatorAgg.total
              : null,
          validator_total_turns_24h: Number(validatorAgg?.total ?? 0),
          eval_pass_rate: evalTotal > 0 ? evalPassed / evalTotal : null,
          eval_passed: evalPassed,
          eval_total: evalTotal,
          eval_meets_publish_gate:
            evalTotal > 0 ? evalPassed / evalTotal >= 0.875 : null,
          last_eval_run_at: mostRecentRun
            ? mostRecentRun.toISOString()
            : null,
        },
      };
    }),
  );

  // 4. High-level counts + builder-lens reads (single round-trip via parallel
  // awaits). The two builder reads (marketplace status + wallet balance) fold in
  // here so they add no wall-clock latency, and are fail-soft so the `builder`
  // block always renders.
  const [contactsCount, bookingsCount, dealsCount, marketplaceStatuses, walletMicros, earningsMicros] =
    await Promise.all([
      db
        .select({ n: count() })
        .from(contacts)
        .where(eq(contacts.orgId, orgId))
        .then((r) => Number(r[0]?.n ?? 0)),
      db
        .select({ n: count() })
        .from(bookings)
        .where(eq(bookings.orgId, orgId))
        .then((r) => Number(r[0]?.n ?? 0)),
      db
        .select({ n: count() })
        .from(deals)
        .where(eq(deals.orgId, orgId))
        .then((r) => Number(r[0]?.n ?? 0)),
      loadAgentMarketplaceStatusForOrg(orgId)
        .then((m) => [...m.values()])
        .catch(() => []),
      // Task 10, Controller-assigned B: read the SAME wallet a top-up
      // actually credits (resolveWalletStripeMode — key-derived) instead of
      // always reading the default "test" wallet. This is what
      // builder.wallet_balance_usd (dashboard + `seldonframe status`) shows,
      // so an unthreaded read here would silently show $0 forever on a live
      // configuration.
      getWalletBalanceMicros(orgId, resolveWalletStripeMode(process.env)).catch(() => 0),
      getBuilderEarningsMicros(orgId).catch(() => 0),
    ]);

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

  // 5. Composio (managed-OAuth app connections) configured probe. Cheap:
  // "configured" = the platform key is set (env) OR this workspace stored a BYO
  // Composio key / has an active session secret. The secret check is a single
  // indexed lookup (workspace_secrets has a (workspace_id, service_name) index),
  // skipped entirely when the platform env key is present.
  let composioConfigured = Boolean(process.env.COMPOSIO_API_KEY?.trim());
  if (!composioConfigured) {
    const secretRow = await db
      .select({ id: workspaceSecrets.id })
      .from(workspaceSecrets)
      .where(
        and(
          eq(workspaceSecrets.workspaceId, orgId),
          inArray(workspaceSecrets.serviceName, ["composio", "composio_session"]),
        ),
      )
      .limit(1);
    composioConfigured = secretRow.length > 0;
  }

  // Builder lens (additive): compute the build→sell ladder from data we already
  // have (agentStats + the marketplace/wallet reads folded into the Promise.all
  // above). Attached as the `builder` block; the SKILL directs builder-agents to
  // follow it and ignore the operator counts/next_steps. Operators just ignore it.
  const builderLadder = buildBuilderLadder(
    deriveBuilderSignals({
      agentCount: agentRows.length,
      agentStats: agentStats.map((a) => ({
        eval_total: a.stats.eval_total,
        eval_meets_publish_gate: a.stats.eval_meets_publish_gate,
      })),
      marketplaceStatuses: marketplaceStatuses.map((l) => ({
        listed: l.listed,
        priceModel: l.priceModel,
      })),
    }),
  );
  const listingLinks = marketplaceStatuses
    .filter((l) => l.listed && l.slug)
    .map((l) => `/marketplace/${l.slug}`);

  // Payout signal (additive) — only when marketplace billing is ON. Two cheap DB
  // reads (NO Stripe call on this hot path); the authoritative payouts_enabled +
  // transfer check happens at requestPayout time. Off → undefined → "coming_soon".
  let payoutSignal:
    | { connected: boolean; withdrawableUsd: number; minUsd: number }
    | undefined;
  try {
    if (isBillingEnabled(process.env as Record<string, string | undefined>)) {
      const [conn] = await db
        .select({ id: stripeConnections.id })
        .from(stripeConnections)
        .where(and(eq(stripeConnections.orgId, orgId), eq(stripeConnections.isActive, true)))
        .limit(1);
      const withdrawableMicros = await getWithdrawableEarningsMicros(orgId);
      payoutSignal = {
        connected: Boolean(conn),
        withdrawableUsd: Math.round((withdrawableMicros / 1_000_000) * 100) / 100,
        minUsd: MIN_WITHDRAW_USD,
      };
    }
  } catch {
    /* leave payoutSignal undefined → "coming_soon" */
  }

  const lifecycle = buildLifecycleView({
    agents: agentStats.map((a) => {
      const mk = marketplaceStatuses.find((m) => m.slug === a.slug);
      return {
        name: a.name,
        slug: a.slug,
        status: a.status,
        eval_total: a.stats.eval_total,
        eval_meets_publish_gate: a.stats.eval_meets_publish_gate,
        listed: Boolean(mk?.listed),
        priced: ["per_usage", "per_outcome"].includes(String(mk?.priceModel ?? "")),
      };
    }),
    earningsAccruedUsd: Math.round((earningsMicros / 1_000_000) * 100) / 100,
    walletBalanceUsd: Math.round((walletMicros / 1_000_000) * 100) / 100,
    payout: payoutSignal,
  });

  // Template deploy_readiness (additive, Task C3) — a per-template heads-up on
  // what's missing before `deploy_agent` can go live, computed WITHOUT a
  // deployment (most builder templates don't have one yet). Mirrors
  // resolveDeployReadiness (lib/deployments/deploy-readiness-deps.ts) exactly,
  // minus the two deployment-only inputs: `deployment.phoneNumber` (no
  // deployment ⇒ never yet attached) and onboarding `progress` (no
  // deployment ⇒ null, same as a freshly-created one). wizardPath is dropped
  // (deploy_agent is the verb that creates the deployment + the real wizard
  // link) in favor of a boolean hint. FAIL-SOFT end-to-end: any failure —
  // listing templates, or scoring one template — drops that piece silently so
  // the operator-facing fields above are byte-for-byte unaffected and
  // get_workspace_state never breaks on this account.
  //
  // tier0Available (Task 10) — computed ONCE, org-wide (it doesn't depend on
  // the template), reusing the `walletMicros` balance already fetched above
  // in the same Promise.all — adds ZERO extra DB round trips even though
  // buildTemplateDeployReadiness scores every template.
  const tier0Available =
    voiceManagedEnabled(process.env) &&
    Boolean(resolveMasterTwilio(process.env)) &&
    walletMicros >= TIER0_READY_FLOOR_MICROS;
  const templateReadiness = await buildTemplateDeployReadiness(orgId, tier0Available);

  // voice_billing (T10 review, F3) — for every ACTIVE sf_managed voice
  // deployment this org owns, surface whether it's currently suspended
  // (a delinquentSince marker from Task 6/7's rent cron or the usage-
  // shortfall webhook) and/or the wallet is below the accept floor (the SAME
  // ACCEPT_FLOOR_MICROS the live-call accept-gate uses — see
  // computeVoiceBillingSignal). Reuses the SAME `walletMicros` balance
  // already fetched above (zero extra DB round trips), so this is additive
  // to `tier0Available`'s cost, not a second wallet read. Entirely fail-soft:
  // any failure (listing this org's sf_managed deployments) drops the whole
  // block silently — this endpoint must never 500 from a wallet/DB hiccup.
  const voiceBilling = await buildVoiceBillingForOrg(orgId, walletMicros);

  // 6. Compose response. Designed to be self-explanatory to an LLM:
  // each section answers a question Claude Code would otherwise have
  // to ask via separate tool calls.
  return NextResponse.json({
    ok: true,
    workspace: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      timezone: org.timezone,
      industry:
        ((org.soul as { industry?: string } | null)?.industry as string) ??
        null,
      created_at: org.createdAt,
      dashboard_url: `https://${baseDomain}/dashboard`,
      public_site_url: `https://${org.slug}.${baseDomain.replace(/^app\./, "")}`,
    },
    integrations: {
      anthropic: { configured: isConfigured("anthropic") },
      openai: { configured: isConfigured("openai") },
      twilio: { configured: isConfigured("twilio") },
      resend: { configured: isConfigured("resend") },
      kit: { configured: isConfigured("kit") },
      mailchimp: { configured: isConfigured("mailchimp") },
      // Composio managed-OAuth app connections (Gmail/Calendar/Slack/…).
      // configured = platform COMPOSIO_API_KEY set OR a BYO composio key /
      // active session secret exists for this workspace.
      composio: { configured: composioConfigured },
    },
    agents: agentStats,
    counts: {
      contacts: contactsCount,
      bookings: bookingsCount,
      deals: dealsCount,
      agents: agentRows.length,
    },
    next_steps: composeNextSteps({
      agentCount: agentRows.length,
      anthropicConfigured: isConfigured("anthropic"),
      anyAgentLive: agentStats.some((a) => a.status === "live"),
      anyAgentNeedingEvalRun: agentStats.some(
        (a) =>
          a.status !== "live" && (a.stats.eval_total === 0 || !a.stats.eval_meets_publish_gate),
      ),
    }),
    // Builder lens (additive) — see the computation above. The operator fields
    // (counts, integrations, next_steps) are untouched; a builder-agent follows
    // this block and, per the SKILL, ignores the operator furniture.
    builder: {
      goal: "Build and sell an AI agent — from your IDE.",
      current_rung: builderLadder.currentRung,
      next_action: builderLadder.nextAction,
      progress: builderLadder.progress,
      rungs: builderLadder.rungs,
      wallet_balance_usd: Math.round((walletMicros / 1_000_000) * 100) / 100,
      listing_links: listingLinks,
      earnings: lifecycle.earnings,
      agents: lifecycle.agents,
      fund_hint: lifecycle.fund_hint,
      // Additive (Task C3) — per-TEMPLATE deploy readiness (see
      // buildTemplateDeployReadiness below). Distinct from `agents` above
      // (which reflects already-created `agents` rows / lifecycle stage);
      // `templates` covers agent_templates rows a builder may not have
      // deployed at all yet, so deploy_agent's "what's still missing" is
      // knowable before the first deploy attempt. Omitted (never an empty
      // array masquerading as "no templates") only when the whole read
      // failed — see the fail-soft wrapper.
      ...(templateReadiness ? { templates: templateReadiness } : {}),
      // Additive (T10 review, F3) — per-deployment voice_billing signal for
      // every active sf_managed voice deployment this org owns. Omitted
      // entirely (never an empty array masquerading as "no voice
      // deployments") only when the whole read failed — see
      // buildVoiceBillingForOrg's fail-soft wrapper. An org with zero active
      // sf_managed deployments gets `voice_deployments: []`, which IS a
      // meaningful, successfully-computed answer (distinct from omission).
      ...(voiceBilling ? { voice_deployments: voiceBilling } : {}),
    },
  });
}

// ─── deploy_readiness (Task C3) ──────────────────────────────────────────────

type TemplateDeployReadinessEntry = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  deploy_readiness: {
    ready: boolean;
    requirements: DeployReadiness["requirements"];
    missing: DeployReadiness["missing"];
  } | null;
  /** Task 10 — SF's zero-connect Tier-0 instant-number path is available for
   *  this org right now (voiceManagedEnabled && master creds && wallet ≥
   *  TIER0_READY_FLOOR_MICROS). Org-wide, not template-specific; echoed on
   *  every entry so a consumer never has to separately resolve the wallet
   *  balance to know a voice deploy can go instantly live. */
  tier0_available: boolean;
};

/** Score ONE template's deploy readiness without a deployment. Mirrors
 *  resolveDeployReadiness (lib/deployments/deploy-readiness-deps.ts) — same
 *  inputs (onboarding steps / live tool-connection statuses / telephony
 *  need+connected+Tier-0-available / progress) fed into the SAME pure
 *  computeDeployReadiness — except `deployment.phoneNumber` and
 *  `deployment.customization` don't exist pre-deploy, so telephonyConnected
 *  relies solely on the org's BYO Twilio creds and progress is always null
 *  (identical to a just-created deployment, which starts with no onboarding
 *  progress either). `tier0Available` (Task 10) is org-wide and passed in
 *  from the caller rather than re-resolved per template — see
 *  buildTemplateDeployReadiness. Never throws — a bad blueprint shape
 *  degrades to `null` (caller omits the field for that template) rather than
 *  failing the whole templates list. */
async function computeTemplateDeployReadiness(
  orgId: string,
  template: Pick<AgentTemplate, "type" | "blueprint">,
  tier0Available: boolean,
): Promise<DeployReadiness | null> {
  try {
    const blueprint = template.blueprint ?? {};
    const normalized = normalizeBlueprintForOnboarding(template.type, blueprint);
    const steps = buildOnboardingSteps(normalized);

    const toolStatuses = await computeToolConnectionStatuses(blueprint.connectors ?? [], (binding) =>
      isBindingConnectedForOrg(orgId, binding),
    );

    const surface = surfaceForType(template.type as AgentTemplateType);
    const telephonyNeeded = deploymentNeedsNumber(blueprint.trigger, surface);
    const telephony = await resolveBuilderTelephony(orgId);
    const telephonyConnected = telephony.ok === true;

    return computeDeployReadiness({
      steps,
      toolStatuses,
      telephonyNeeded,
      telephonyConnected,
      tier0Available,
      progress: null,
      wizardPath: "",
    });
  } catch (err) {
    console.warn(
      "[workspace-state] computeTemplateDeployReadiness failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/** List the builder's templates and score each one's deploy readiness, in
 *  parallel. Fail-soft at every layer: listAgentTemplates throwing (or the
 *  whole function erroring for any other reason) returns `null` — the caller
 *  then OMITS `builder.templates` entirely rather than shipping a broken or
 *  empty-looking array, so the operator-facing response is byte-for-byte
 *  unaffected. A single template's scoring failure does not drop the others
 *  (computeTemplateDeployReadiness itself never throws — see above).
 *  `tier0Available` (Task 10) is resolved ONCE by the caller (org-wide, reuses
 *  the wallet balance already fetched for `builder.wallet_balance_usd` — zero
 *  extra DB round trips even with N templates) and echoed alongside each
 *  entry's `deploy_readiness` as `tier0_available` so a consumer doesn't have
 *  to separately fetch/interpret the wallet balance to know an instant-number
 *  deploy is on the table. */
async function buildTemplateDeployReadiness(
  orgId: string,
  tier0Available: boolean,
): Promise<TemplateDeployReadinessEntry[] | null> {
  try {
    const templates = await listAgentTemplates(orgId);
    return await Promise.all(
      templates.map(async (t) => {
        const readiness = await computeTemplateDeployReadiness(orgId, t, tier0Available);
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          type: t.type,
          status: t.status,
          deploy_readiness: readiness
            ? { ready: readiness.ready, requirements: readiness.requirements, missing: readiness.missing }
            : null,
          tier0_available: tier0Available,
        };
      }),
    );
  } catch (err) {
    console.warn(
      "[workspace-state] buildTemplateDeployReadiness failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// ─── voice_billing (T10 review, F3) ─────────────────────────────────────────

type VoiceDeploymentBillingEntry = {
  deployment_id: string;
  voice_billing: { suspended: boolean; low_balance: boolean };
};

/**
 * List this org's active sf_managed voice deployments and attach each one's
 * `voice_billing` signal (suspended / low_balance) via the pure
 * computeVoiceBillingSignal (delinquency.ts) — `suspended` per-deployment
 * (its own delinquentSince marker), `low_balance` shared across all of them
 * (one wallet per org; `walletMicros` is the SAME balance already fetched for
 * `builder.wallet_balance_usd`/`tier0Available` above, so this adds ZERO
 * extra DB round trips). Entirely fail-soft: listActiveSfManagedDeploymentsForOrg
 * throwing (or anything else in here failing) returns `null` — the caller
 * OMITS `builder.voice_deployments` entirely rather than 500ing the whole
 * endpoint over a wallet/DB hiccup. An org with no active sf_managed
 * deployments still gets a successfully-computed `[]` (never null on the
 * happy path) — distinct from the omission-on-failure case.
 */
async function buildVoiceBillingForOrg(
  orgId: string,
  walletMicros: number,
): Promise<VoiceDeploymentBillingEntry[] | null> {
  try {
    const deployments = await listActiveSfManagedDeploymentsForOrg(orgId);
    return deployments.map((d) => ({
      deployment_id: d.deploymentId,
      voice_billing: computeVoiceBillingSignal({
        delinquentSince: d.delinquentSince,
        balanceMicros: walletMicros,
      }),
    }));
  } catch (err) {
    console.warn(
      "[workspace-state] buildVoiceBillingForOrg failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function composeNextSteps(input: {
  agentCount: number;
  anthropicConfigured: boolean;
  anyAgentLive: boolean;
  anyAgentNeedingEvalRun: boolean;
}): string[] {
  const steps: string[] = [];
  if (!input.anthropicConfigured) {
    steps.push(
      "Configure Anthropic LLM key — call configure_llm_provider({ provider: 'anthropic' }) (auto-detects ANTHROPIC_API_KEY from your shell env), or paste in /settings/integrations/llm.",
    );
  }
  if (input.agentCount === 0) {
    steps.push(
      "No agents yet — call build_website_chatbot to create your first chatbot end-to-end (configures LLM + creates + publishes to test in one call).",
    );
  } else if (input.anyAgentNeedingEvalRun) {
    steps.push(
      "One or more agents in draft/test — run their eval suite via /agents/[id]/evals → 'Run evals now' or call run_agent_evals from MCP. Need ≥87.5% pass to promote to live.",
    );
  } else if (!input.anyAgentLive) {
    steps.push(
      "All agents pass evals but none are live — promote with publish_agent({ status: 'live' }).",
    );
  } else {
    steps.push(
      "Workspace is healthy. Use update_website_chatbot to iterate FAQ/pricing on existing agents, or tail_agent_conversations to see recent customer chats.",
    );
  }
  return steps;
}
