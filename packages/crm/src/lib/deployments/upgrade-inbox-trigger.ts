// Email-agent slice (Part B2) — poll -> push upgrade for a record-compiled
// inbox-watch agent.
//
// /record infers a recurring inbox check as `{kind:"schedule",
// cron:"0 * * * *", channel:"email"}` (compile-agent.ts's
// inferTriggerFromModel — the hourly-poll floor). When the deploying org has
// a live Gmail connection AND a webhook secret configured, we can do BETTER:
// register a live Composio GMAIL_NEW_GMAIL_MESSAGE trigger and flip the
// TEMPLATE's trigger to `{kind:"event", event:"composio.gmail.new_message",
// channel:"email"}` so composio-event-dispatch.ts (Part B1) fires it on push
// instead of waiting up to an hour.
//
// WHY THE TEMPLATE, NOT THE DEPLOYMENT: the trigger is a property of the
// agent TEMPLATE (agentTemplates.blueprint.trigger) — every deployment of a
// template resolves the SAME trigger (see listScheduledAgentDeployments /
// listComposioEventDeploymentsForOrg, both of which read templateBlueprint).
// A self-deploy is 1:1 (builderOrgId === clientOrgId), so upgrading the
// template IS upgrading "this deployment's" trigger; a multi-client agency
// template would need a per-deployment override (out of scope — no
// migration this slice, see the spec's "no new migration expected" invariant).
//
// FAIL-SOFT / NEVER A REGRESSION: ALL conditions below must hold before we
// even attempt the live createTrigger call; ANY failure — a missing
// condition, a Composio error, a persist error — returns
// `{upgraded:false, reason}` and leaves the hourly schedule as the floor. The
// upgrade NEVER removes or weakens the existing trigger on failure.

import { resolveAgentTrigger, type AgentTrigger } from "@/lib/agents/triggers/agent-trigger";
import { blueprintHasGmailBinding } from "@/lib/agents/lifecycle/deploy-to-self";
import type { AgentBlueprint } from "@/db/schema/agents";

/** The exact cron /record's inferTriggerFromModel emits for an inbox-watch
 *  recording (compile-agent.ts) — the ONLY cron this upgrade targets. A
 *  hand-authored/different cron is left alone (not necessarily an inbox
 *  watch at all). */
export const INBOX_WATCH_CRON = "0 * * * *";

/** The composio event slug the upgraded trigger fires on (matches the
 *  webhook's mapped SeldonEvent type — see composio-event-dispatch.ts). */
export const GMAIL_PUSH_EVENT = "composio.gmail.new_message";

export type UpgradeInboxTriggerDeps = {
  /** Resolve the deployment's orgId + template id. Org-scoping check happens
   *  in the orchestrator (below) — this just loads the row. */
  getDeployment: (
    deploymentId: string,
  ) => Promise<{ orgId: string; agentTemplateId: string } | null>;
  /** Load the template's current blueprint. */
  getTemplateBlueprint: (agentTemplateId: string) => Promise<AgentBlueprint | null>;
  /** Verify-gate FIX 4 — how many deployments (of ANY status) point at this
   *  template? Since the trigger is flipped at the TEMPLATE level (see the
   *  file header), a template with more than one deployment must refuse the
   *  flip — a future second client deploying the same template would
   *  silently inherit an event trigger it never registered its own
   *  Composio createTrigger for. */
  countDeploymentsForTemplate: (agentTemplateId: string) => Promise<number>;
  /** Is `COMPOSIO_WEBHOOK_SECRET` configured? (Sync — an env read.) */
  hasWebhookSecret: () => boolean;
  /** Does this org have a live, connected Gmail toolkit connection? */
  isGmailConnected: (orgId: string) => Promise<boolean>;
  /** Register the live Composio trigger (client.ts:275's createTrigger). */
  createTrigger: (orgId: string) => Promise<{ triggerId: string | null }>;
  /** Persist the flipped trigger onto the TEMPLATE's blueprint. */
  updateTemplateTrigger: (agentTemplateId: string, trigger: AgentTrigger) => Promise<void>;
  /** Stamp the audit marker on the DEPLOYMENT (not the template — this is
   *  per-deployment observability, not a shared trigger property). */
  stampUpgraded: (deploymentId: string, at: Date) => Promise<void>;
  now?: () => Date;
};

export type UpgradeInboxTriggerResult =
  | { upgraded: true }
  | { upgraded: false; reason?: string };

/**
 * Attempt the poll->push upgrade for one deployment. NEVER throws — every
 * failure path returns `{upgraded:false, reason}` and leaves the existing
 * (schedule) trigger untouched.
 */
export async function maybeUpgradeInboxTriggerToPush(
  deps: UpgradeInboxTriggerDeps,
  args: { orgId: string; deploymentId: string },
): Promise<UpgradeInboxTriggerResult> {
  try {
    const deployment = await deps.getDeployment(args.deploymentId);
    if (!deployment) return { upgraded: false, reason: "deployment_not_found" };
    if (deployment.orgId !== args.orgId) {
      return { upgraded: false, reason: "org_mismatch" };
    }

    const blueprint = await deps.getTemplateBlueprint(deployment.agentTemplateId);
    if (!blueprint) return { upgraded: false, reason: "template_not_found" };

    const trigger = resolveAgentTrigger(
      (blueprint as { trigger?: unknown }).trigger as Parameters<typeof resolveAgentTrigger>[0],
    );
    if (
      trigger.kind !== "schedule" ||
      trigger.channel !== "email" ||
      trigger.cron !== INBOX_WATCH_CRON
    ) {
      return { upgraded: false, reason: "not_inbox_watch_schedule" };
    }

    if (!blueprintHasGmailBinding(blueprint)) {
      return { upgraded: false, reason: "no_gmail_binding" };
    }

    // Verify-gate FIX 4 — refuse the flip when the template is shared by
    // more than one deployment (a future multi-client deploy of the SAME
    // template must never silently inherit an event trigger it never
    // registered its own Composio createTrigger for). A count error fails
    // CLOSED (treated as multi_deployment — the safe direction).
    let deploymentCount: number;
    try {
      deploymentCount = await deps.countDeploymentsForTemplate(deployment.agentTemplateId);
    } catch (err) {
      console.warn(
        `[upgrade-inbox-trigger] countDeploymentsForTemplate failed for template ${deployment.agentTemplateId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return { upgraded: false, reason: "multi_deployment" };
    }
    if (deploymentCount > 1) {
      return { upgraded: false, reason: "multi_deployment" };
    }

    if (!deps.hasWebhookSecret()) {
      return { upgraded: false, reason: "no_webhook_secret" };
    }

    const connected = await deps.isGmailConnected(args.orgId).catch(() => false);
    if (!connected) {
      return { upgraded: false, reason: "gmail_not_connected" };
    }

    let triggerId: string | null;
    try {
      const created = await deps.createTrigger(args.orgId);
      triggerId = created.triggerId;
    } catch (err) {
      return {
        upgraded: false,
        reason: `create_trigger_error:${err instanceof Error ? err.message.slice(0, 100) : "unknown"}`,
      };
    }
    if (!triggerId) return { upgraded: false, reason: "create_trigger_failed" };

    const upgradedTrigger: AgentTrigger = {
      kind: "event",
      event: GMAIL_PUSH_EVENT,
      channel: "email",
    };

    try {
      await deps.updateTemplateTrigger(deployment.agentTemplateId, upgradedTrigger);
      await deps.stampUpgraded(args.deploymentId, deps.now?.() ?? new Date());
    } catch (err) {
      // The remote trigger now exists but we couldn't persist the flip — the
      // schedule stays the floor (worst case: a redundant Composio trigger,
      // never a lost one). Fail-soft.
      console.warn(
        `[upgrade-inbox-trigger] persist failed for deployment ${args.deploymentId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return { upgraded: false, reason: "persist_failed" };
    }

    return { upgraded: true };
  } catch (err) {
    console.warn(
      `[upgrade-inbox-trigger] unexpected failure for deployment ${args.deploymentId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { upgraded: false, reason: "unexpected_error" };
  }
}
