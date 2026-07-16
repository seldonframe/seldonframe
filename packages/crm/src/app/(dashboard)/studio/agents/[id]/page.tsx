// ICP-3 — the Agent TEMPLATE editor page (server component).
//
// Loads the builder's template (org-guarded via getOrgId + builderOrgId match),
// then renders the editor — greeting / persona script / FAQ / voice / tools —
// reusing the voice-receptionist editor's section patterns. Saves flow through
// saveAgentTemplateBlueprintAction. The header offers Test (the sandboxed chat
// panel, task 1.2) + Deploy (the deploy-to-client flow). The eval gate is 1.3.

import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import {
  getAgentTemplate,
  updateAgentTemplate,
  surfaceForType,
  capabilitiesForSurface,
  DEFAULT_VOICE_RECEPTIONIST_VOICE,
  type AgentTemplateType,
} from "@/lib/agent-templates/store";
import { fillAllBindingTools } from "@/lib/agents/mcp/discover-vetted-tools";
import { resolveAgentTrigger } from "@/lib/agents/triggers/agent-trigger";
import { getSellerListingContextAction } from "@/lib/marketplace/seller-actions";
import { VETTED_CONNECTORS, getVettedConnector } from "@/lib/agents/mcp/connectors";
import { findSessionByTemplateId } from "@/lib/recordings/session-store";
import type { FlowModel } from "@/lib/recordings/trace-schema";
import type { EvalScenario } from "@/lib/agents/evals/eval-types";
import type { AgentBlueprint } from "@/db/schema";
import { AgentTemplateEditor } from "./editor-client";
import { ListOnMarketplace } from "./list-on-marketplace";
import { RunEvalsCard } from "./run-evals";
import { EditorSection, EditorSectionDivider } from "./editor-section";
import { TemplateStatusBadge, formatTemplateType } from "../status-badge";
import { DeployButton } from "../deploy-button";
import { DeployToClientsButton } from "../deploy-to-clients-button";
import { TestButton } from "../test-button";
import { isAgentLifecycleEnabled } from "@/lib/agents/lifecycle/policy";
import { lifecycleGate, hasActionableTools } from "@/lib/agents/lifecycle/gate";
import { getLatestEvalRun } from "@/lib/agents/evals/eval-runs-store";
import { supervisedRuns, type SupervisedRun } from "@/db/schema/agent-lifecycle";
import { composioForOrg, listConnections } from "@/lib/integrations/composio/client";
import { getComposioToolkit } from "@/lib/integrations/composio/catalog";
import { listDeployments } from "@/lib/deployments/store";
import { getDeploymentLiveStatus } from "@/lib/agent-receipts/store";
import { DeploymentLiveBanner } from "@/components/agent-receipts/live-banner";
import {
  deriveLifecycleStages,
  defaultOpenStageId,
  deriveLifecycleStageSummaries,
  type LifecycleStageId,
} from "./lifecycle/stage-derivation";
import { requiredToolkitSlugs, countConnectedRequiredToolkits } from "./lifecycle/connected-toolkits";
import { AgentLifecycleAccordion } from "./lifecycle/agent-lifecycle-accordion";
import { Collapsible } from "./lifecycle/collapsible";
import { LearnedStage } from "./lifecycle/learned-stage";
import { VerifiedStage } from "./lifecycle/verified-stage";
import { ConnectedStage, type RequiredToolkitView } from "./lifecycle/connected-stage";
import { RunStage } from "./lifecycle/run-stage";
import { derivePlannedActions, deriveRunVerdict } from "./lifecycle/run-plan";
import { SellStage } from "./lifecycle/sell-stage";
import { resolveLifecycleMode, resolveInitialStageId } from "./lifecycle/setup-mode";
import { SetupModeShell } from "./lifecycle/setup-mode-shell";
import { CelebrationScreen } from "./lifecycle/celebration-screen";

export const dynamic = "force-dynamic";
// Composio's SDK (lib/integrations/composio/client.ts, imported below for the
// Connected stage) is a Node-runtime-only dependency — this page now
// transitively imports it, so it must declare the Node runtime explicitly.
export const runtime = "nodejs";
// H2 hotfix (2026-07-11) — startSupervisedRunAction and runAgentEvalsAction
// (both invoked from this page) defer their real work into `after()`,
// which keeps the underlying function instance alive past the response.
// 300s is Vercel's hard function ceiling; DEFAULT_TIMEOUT_MS (supervised
// runs, 240s) and the eval harness both stay comfortably under it.
export const maxDuration = 300;

/** Org-scoped read of the most recent supervised_runs row for a template
 *  (any status — the Run stage shows the last attempt on revisit). */
async function findLatestSupervisedRun(orgId: string, templateId: string): Promise<SupervisedRun | null> {
  const [row] = await db
    .select()
    .from(supervisedRuns)
    .where(and(eq(supervisedRuns.orgId, orgId), eq(supervisedRuns.templateId, templateId)))
    .orderBy(desc(supervisedRuns.startedAt))
    .limit(1);
  return row ?? null;
}

/** Org-scoped read: does at least one succeeded supervised run exist for this
 *  template? The same predicate lifecycleGate + the marketplace publish gate
 *  use (lib/marketplace/seller-actions.ts's own copy), duplicated here rather
 *  than exported cross-module to keep each call site's org-scope explicit. */
async function hasSucceededSupervisedRunForTemplate(args: {
  orgId: string;
  templateId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: supervisedRuns.id })
    .from(supervisedRuns)
    .where(
      and(
        eq(supervisedRuns.orgId, args.orgId),
        eq(supervisedRuns.templateId, args.templateId),
        eq(supervisedRuns.status, "succeeded"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export default async function AgentTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const { id } = await params;
  // The generate-by-default flow routes here with `?new=1` right after creating
  // a template (describe-agent.tsx). That flag arms the editor's L5.3 edit-
  // capture: the FIRST save is treated as the operator correcting what we
  // generated, recorded as a generator lesson. Any other entry → no capture.
  const sp = await searchParams;
  const isNew = sp.new === "1" || sp.new === "true";
  const template = await getAgentTemplate(id);
  // Ownership guard: only the builder that owns the template can open it.
  if (!template || template.builderOrgId !== orgId) notFound();

  const blueprint = (template.blueprint ?? {}) as AgentBlueprint;
  // template.type is the DB text column (typed `string`); the column only ever
  // holds a valid AgentTemplateType, and surfaceForType safely defaults
  // anything non-chat to voice.
  const surface = surfaceForType(template.type as AgentTemplateType);
  // The tools a template can toggle, per surface — voice gets the voice set
  // (excl. the chat-only provide_faq_answer), chat gets the chat set (excl. the
  // voice-only get_quote_range). Same helper the generator's allow-list uses.
  const allCapabilities = capabilitiesForSurface(surface);
  // What FIRES this agent (unified agent model P1). Resolve the stored
  // blueprint.trigger, falling back to the inbound default derived from the
  // template's surface — so an existing template with no trigger reads as
  // "inbound · <surface>", byte-for-byte today's behavior.
  const trigger = resolveAgentTrigger(blueprint.trigger, surface);

  // Seller marketplace context: the current listing for this template (if any)
  // + the builder's Stripe Connect status, so the "List on the marketplace"
  // panel opens pre-filled. Plus the builder's org name for the listing's
  // "built by" credit. Both are best-effort — never block the editor.
  const [listingCtx, orgRow] = await Promise.all([
    getSellerListingContextAction({ templateId: template.id }),
    db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
  ]);
  const sellerListing = listingCtx.ok ? listingCtx.listing : null;
  const sellerConnect = listingCtx.ok ? listingCtx.connect : { ready: false, pending: false };
  const builderName = orgRow[0]?.name ?? "A SeldonFrame builder";

  // "Born from your recording" provenance panel — only the templates
  // compiled via /record set recordingSessions.agentTemplateId, so this is
  // null (and the panel renders nothing) for every ordinary template.
  const recordingSession = await findSessionByTemplateId(db, template.id);
  const recordingProvenance = recordingSession
    ? (() => {
        const flowModel = recordingSession.flowModel as FlowModel | null;
        const coverage = flowModel?.coverage ?? [];
        const automatable = coverage.filter((c) => c.tier === "green").length;
        const needsApproval = coverage.filter((c) => c.tier === "yellow").length;
        const staysWithYou = coverage.filter((c) => c.tier === "red").length;
        const interviewLog = Array.isArray(recordingSession.interviewLog)
          ? (recordingSession.interviewLog as unknown[])
          : [];
        return {
          goal: flowModel?.goal ?? null,
          stepCount: flowModel?.steps.length ?? 0,
          automatable,
          needsApproval,
          staysWithYou,
          clarifications: Math.floor(interviewLog.length / 2),
          openQuestions: (recordingSession.openQuestions as string[] | null) ?? [],
        };
      })()
    : null;

  // Agent lifecycle slice — flag off is otherwise BYTE-FOR-BYTE the existing
  // page below (early return). Flag on renders the five-stage ladder
  // instead. Agent receipts slice (Task 3) adds ONE extra query here (this
  // template's most relevant deployment + its LIVE status) so the banner
  // below can render — the only query this early-return path now runs
  // beyond what was already loaded above.
  const lifecycleEnabled = isAgentLifecycleEnabled({ SF_AGENT_LIFECYCLE: process.env.SF_AGENT_LIFECYCLE });

  if (!lifecycleEnabled) {
  const templateDeployments = await listDeployments(orgId);
  const primaryDeployment =
    templateDeployments.find((d) => d.agentTemplateId === template.id && d.status === "active") ??
    templateDeployments.find((d) => d.agentTemplateId === template.id) ??
    null;
  const liveStatus = primaryDeployment
    ? await getDeploymentLiveStatus(primaryDeployment.id, orgId)
    : null;

  return (
    <section className="animate-page-enter">
      {/* ── Sticky header (Claude Design, direction A) ──────────────────────
          A calm action bar that pins just under the dashboard topbar
          (matching the in-repo ProposalStepsHeader convention: sticky top-0
          z-10 + opaque blurred bg). Back · "Agents / {name}" · status chip on
          the left; Deploy-to-clients · Deploy on the right. The Save control
          stays a wired affordance inside the editor (its dirty/saved state
          lives in the client island) — see the editor's Save section. */}
      <div className="sticky top-0 z-10 -mx-4 mb-2 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href="/studio/agents"
            aria-label="Back to Agents"
            className="crm-topbar-icon-btn size-9 shrink-0"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/studio/agents"
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              Agents
            </Link>
            <span aria-hidden className="text-xs text-muted-foreground">
              /
            </span>
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-[17px]">
              {template.name}
            </h1>
            <TemplateStatusBadge status={template.status} />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <DeployToClientsButton templateId={template.id} variant="secondary" />
            <DeployButton templateId={template.id} variant="primary" />
          </div>
        </div>
      </div>

      {/* The calm scroll body — one breathing document of grouped sections. */}
      <div className="mx-auto max-w-3xl space-y-2 pt-6 pb-24">
        {recordingProvenance ? (
          <div className="mb-4 rounded-lg border border-border/70 bg-muted/30 p-4">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Born from your recording
            </h2>
            {recordingProvenance.goal ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {recordingProvenance.goal}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {recordingProvenance.stepCount} step
              {recordingProvenance.stepCount === 1 ? "" : "s"} ·{" "}
              {recordingProvenance.automatable} automatable /{" "}
              {recordingProvenance.needsApproval} need approval /{" "}
              {recordingProvenance.staysWithYou} stay with you
              {recordingProvenance.clarifications > 0
                ? ` · ${recordingProvenance.clarifications} operator clarification${
                    recordingProvenance.clarifications === 1 ? "" : "s"
                  }`
                : ""}
            </p>
            {recordingProvenance.openQuestions.length > 0 ? (
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-foreground">Still open:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {recordingProvenance.openQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {formatTemplateType(template.type)} template. Configure it once here,
          test it in the sandbox, then deploy it to as many clients as you like.
        </p>

        {/* Agent receipts slice (Task 3) — LIVE status for this template's
            deployment (renders nothing when there's no deployment, or it's
            not active — see DeploymentLiveBanner). */}
        <DeploymentLiveBanner status={liveStatus} />

        <div className="pt-6">
          {/* Sections 01–04 + Save live inside the editor island (they need
              client state). It renders: When it runs · What it says & does ·
              Tools · Quality & guardrails · Save. */}
          <AgentTemplateEditor
            templateId={template.id}
            surface={surface}
            isNew={isNew}
            initialTrigger={trigger}
            initialBlueprint={{
              greeting: blueprint.greeting ?? "",
              customSkillMd: blueprint.customSkillMd ?? "",
              voice: blueprint.voice ?? DEFAULT_VOICE_RECEPTIONIST_VOICE,
              capabilities: blueprint.capabilities ?? [...allCapabilities],
              faq: (blueprint.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
              quoteRanges: (blueprint.quoteRanges ?? []).map((r) => ({
                service: r.service,
                low: r.low,
                high: r.high,
              })),
              // MCP connector bindings (#3). Plain JSON (serviceName pointer +
              // cached tool schemas — NEVER the bearer key) so they cross the
              // server→client boundary safely. The picker renders + toggles these.
              connectors: blueprint.connectors ?? [],
              // L3 GUARDRAILS + L2 VERIFY (outbound-UX F5). Pass through as-is
              // (plain JSON, no secrets). `null` (absent on the blueprint) seeds
              // the editor's "Use smart defaults" toggle ON, so the per-skill
              // runtime defaults apply until the builder overrides them.
              guardrails: blueprint.guardrails ?? null,
              verify: blueprint.verify ?? null,
            }}
            allCapabilities={allCapabilities}
            vettedConnectors={VETTED_CONNECTORS.map((c) => ({
              id: c.id,
              label: c.label,
              secretService: c.secretService,
              authType: c.authType,
            }))}
          />
        </div>

        <EditorSectionDivider />

        {/* ── 05 · Try it ── Score the agent against realistic customers. (The
            sandbox chat lives behind Test; the event-only "Send test" affordance
            is inline in the editor's trigger section.) */}
        <EditorSection
          step="05"
          title="Try it"
          anchor="try"
          description="Score the agent against realistic customers, or open the sandbox to chat with it. Nothing is booked or sent."
        >
          {/* Run evals — play the agent against realistic customers, see a pass
              rate + exactly what failed, and record failures as Brain lessons (E5). */}
          <RunEvalsCard templateId={template.id} />
          <div className="flex flex-wrap items-center gap-2">
            <TestButton templateId={template.id} variant="secondary" />
          </div>
        </EditorSection>

        <EditorSectionDivider />

        {/* ── Publish ── List this template on the marketplace as a sellable
            kind:'agent' listing, with a live preview + the paid Connect gate. */}
        <EditorSection
          step="06"
          title="Publish"
          anchor="publish"
          description="Sell this template on the marketplace so other businesses can deploy it."
        >
          <ListOnMarketplace
            templateId={template.id}
            templateName={template.name}
            agentType={template.type}
            builderName={builderName}
            initialListing={sellerListing}
            initialConnect={sellerConnect}
          />
        </EditorSection>
      </div>
    </section>
  );
  }

  // ── Lifecycle ladder (SF_AGENT_LIFECYCLE=1) ────────────────────────────
  // Self-heal: widen any never-discovered composio binding's enabledTools
  // with real tools (composio live-tool-discovery slice, 2026-07-11) BEFORE
  // deriving the Connected stage's required toolkits, so an agent authored
  // before this slice (or one whose live discovery had no key at the time)
  // gets a real allowlist on next view. Idempotent by T1's guards (a re-
  // render after a successful fill is a no-op); no key → unchanged, no
  // write attempted.
  const hasUndiscoveredComposioBinding = (blueprint.connectors ?? []).some(
    (c) => c.kind === "composio" && c.enabledTools.length === 0 && !c.discoveredAt,
  );
  // Also cover an undiscovered vetted-OAuth binding (Circle) — same
  // never-discovered marker guard, widened to the other rail this slice adds.
  const hasUndiscoveredVettedOauthBinding = (blueprint.connectors ?? []).some(
    (c) =>
      c.kind === "vetted" &&
      c.enabledTools.length === 0 &&
      !c.discoveredAt &&
      getVettedConnector(c.id)?.authType === "oauth",
  );
  if (hasUndiscoveredComposioBinding || hasUndiscoveredVettedOauthBinding) {
    const filled = await fillAllBindingTools(orgId, blueprint.connectors);
    if (filled.changed) {
      await updateAgentTemplate({ id: template.id, patch: { connectors: filled.connectors } });
    }
    blueprint.connectors = filled.connectors;
  }

  const requiredToolkits = requiredToolkitSlugs(blueprint.connectors);
  const composioConfigured =
    requiredToolkits.length > 0 ? (await composioForOrg(orgId)) !== null : true;
  const [gate, connections, latestRun, deployments, latestEvalRun] = await Promise.all([
    lifecycleGate(
      { getLatestEvalRun, hasSucceededSupervisedRun: hasSucceededSupervisedRunForTemplate },
      {
        orgId,
        templateId: template.id,
        // F-D: a tool-free (pure-chat) template is exempt from the
        // supervised-run requirement — evals are still required.
        hasActionableTools: hasActionableTools({
          connectors: blueprint.connectors,
          capabilities: blueprint.capabilities,
        }),
      },
    ),
    requiredToolkits.length > 0 && composioConfigured
      ? listConnections(orgId, { extraToolkits: requiredToolkits })
      : Promise.resolve([]),
    findLatestSupervisedRun(orgId, template.id),
    listDeployments(orgId),
    // T4 — the Verified stage's collapsed summary wants the actual pass
    // RATE ("evals 100%"), not just the gate's pass/fail boolean.
    getLatestEvalRun({ orgId, subjectKind: "template", subjectId: template.id }),
  ]);

  // listConnections already returns the mapped ToolkitConnection[] shape —
  // no second mapToolkitConnections pass needed (that helper is for RAW
  // Composio SDK items, which listConnections has already reduced).
  const connectedSlugs = new Set(connections.filter((c) => c.connected).map((c) => c.slug));
  const connectedCount = countConnectedRequiredToolkits(requiredToolkits, connectedSlugs);
  const hasDeploymentForTemplate = deployments.some((d) => d.agentTemplateId === template.id);
  const hasDeploymentOrListing = hasDeploymentForTemplate || Boolean(sellerListing);

  const stages = deriveLifecycleStages({
    hasTemplate: true,
    evalPass: gate.evalPass,
    requiredToolkitCount: requiredToolkits.length,
    connectedToolkitCount: connectedCount,
    supervisedRunSucceeded: gate.supervisedRun,
    supervisedRunExempt: gate.supervisedRunExempt,
    hasDeploymentOrListing,
  });

  const connectionBySlug = new Map(connections.map((c) => [c.slug, c]));
  const requiredToolkitViews: RequiredToolkitView[] = requiredToolkits.map((slug) => {
    const catalog = getComposioToolkit(slug);
    const conn = connectionBySlug.get(slug);
    return {
      slug,
      name: catalog?.label ?? slug,
      logo: catalog?.logo ?? null,
      connected: conn?.connected ?? false,
      why: `Used by ${template.name}'s workflow.`,
    };
  });

  const derivedScenarios = (recordingSession?.derivedScenarios as EvalScenario[] | null) ?? [];
  const answeredQuestions = (recordingSession?.answeredQuestions as
    | { question: string | null; answer: string; answeredAt: string }[]
    | null) ?? [];

  const summaries = deriveLifecycleStageSummaries({
    requiredToolkitCount: requiredToolkits.length,
    connectedToolkitCount: connectedCount,
    evalPassRate: latestEvalRun ? latestEvalRun.passRate : null,
    supervisedRunStatus: latestRun ? (latestRun.status as "running" | "succeeded" | "failed") : null,
    supervisedRunExempt: gate.supervisedRunExempt,
    hasDeploymentOrListing,
    hasRecording: Boolean(recordingProvenance),
  });

  const descriptions: Record<LifecycleStageId, string> = {
    learned: "What Seldon learned from your recording, and how to keep teaching it.",
    verified: "Your recordings are the test.",
    connected: "The apps this agent needs, connected.",
    run: "Run it once — watch every action.",
    sell: "For myself, on the marketplace, or to a client.",
  };

  const editor = (
    <AgentTemplateEditor
      templateId={template.id}
      surface={surface}
      isNew={isNew}
      initialTrigger={trigger}
      initialBlueprint={{
        greeting: blueprint.greeting ?? "",
        customSkillMd: blueprint.customSkillMd ?? "",
        voice: blueprint.voice ?? DEFAULT_VOICE_RECEPTIONIST_VOICE,
        capabilities: blueprint.capabilities ?? [...allCapabilities],
        faq: (blueprint.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
        quoteRanges: (blueprint.quoteRanges ?? []).map((r) => ({
          service: r.service,
          low: r.low,
          high: r.high,
        })),
        connectors: blueprint.connectors ?? [],
        guardrails: blueprint.guardrails ?? null,
        verify: blueprint.verify ?? null,
      }}
      allCapabilities={allCapabilities}
      vettedConnectors={VETTED_CONNECTORS.map((c) => ({
        id: c.id,
        label: c.label,
        secretService: c.secretService,
        authType: c.authType,
      }))}
      collapsibleScript
    />
  );

  // Setup mode (spec §1): incomplete lifecycle -> the one-stage-per-screen
  // wizard at the first incomplete stage; `?view=full` is the explicit
  // escape hatch back to the compact home layout; every stage complete ->
  // home mode is the only mode (nothing left to walk through). Both derive
  // from the SAME `stages` array the accordion already uses — never a
  // second source of truth for completion.
  const lifecycleMode = resolveLifecycleMode({ stages, view: sp.view });
  const initialStageId = resolveInitialStageId(sp.stage, stages);

  // Celebration (T4, spec §3): fires ONLY on the DERIVED verified state —
  // a REAL supervised-run success (never the tool-free exemption, never a
  // button click) — and only while still in Setup mode. If Run just
  // succeeded but the agent is ALSO fully complete otherwise (deployed or
  // listed), resolveLifecycleMode has already flipped to home mode above,
  // so this can only be true while the wizard is still open.
  const isCelebratingRun = lifecycleMode === "setup" && gate.supervisedRun && !gate.supervisedRunExempt;
  const runPlannedActions = derivePlannedActions({
    connectors: blueprint.connectors,
    scenarios: derivedScenarios,
  });
  const runActionLog = latestRun?.actionLog ?? [];
  const runVerdict = deriveRunVerdict({ actionLog: runActionLog, plannedCount: runPlannedActions.length });
  const runActionCount = runActionLog.filter((event) => event.status === "ok").length;

  const bodies: Record<LifecycleStageId, ReactNode> = {
    learned: (
      <>
        <LearnedStage
          templateId={template.id}
          hasRecording={Boolean(recordingProvenance)}
          provenance={recordingProvenance}
          initialAnsweredQuestions={answeredQuestions}
          initialOpenQuestions={recordingProvenance?.openQuestions ?? []}
        />
        {/* T4 — the old 01-04 editor sections (When it runs / What it says
            & does / Tools / Quality), moved off the top-level page and
            folded in here, collapsed by default. */}
        <Collapsible label="Configure the agent" defaultOpen={false}>
          {editor}
        </Collapsible>
      </>
    ),
    verified: <VerifiedStage templateId={template.id} scenarios={derivedScenarios} />,
    connected: (
      <ConnectedStage
        templateId={template.id}
        toolkits={requiredToolkitViews}
        composioConfigured={composioConfigured}
      />
    ),
    // T4 (spec §3) — once the Run stage's completion is a REAL supervised-
    // run success (never the tool-free exemption) AND the wizard is still
    // open, its body becomes the terminal celebration screen instead of the
    // run button — the wizard doesn't hand the operator a "done" checkmark
    // and then keep marching them to Sell as a separate step; the
    // celebration screen already embeds Sell + the share card.
    run: isCelebratingRun ? (
      <CelebrationScreen
        templateId={template.id}
        templateName={template.name}
        agentType={template.type}
        builderName={builderName}
        initialListing={sellerListing}
        initialConnect={sellerConnect}
        evalPass={gate.evalPass}
        supervisedRunSucceeded={gate.supervisedRun}
        supervisedRunExempt={gate.supervisedRunExempt}
        actionCount={runActionCount}
        verdict={runVerdict}
      />
    ) : (
      <RunStage
        templateId={template.id}
        initialLastRun={latestRun}
        supervisedRunExempt={gate.supervisedRunExempt}
        plannedActions={runPlannedActions}
      />
    ),
    sell: (
      <SellStage
        templateId={template.id}
        templateName={template.name}
        agentType={template.type}
        builderName={builderName}
        initialListing={sellerListing}
        initialConnect={sellerConnect}
        evalPass={gate.evalPass}
        supervisedRunSucceeded={gate.supervisedRun}
        supervisedRunExempt={gate.supervisedRunExempt}
      />
    ),
  };

  // Setup mode (spec §1): any stage incomplete -> the one-stage-per-screen
  // wizard, landing on the validated `?stage=` param or the first
  // incomplete stage. `?view=full` (handled inside resolveLifecycleMode)
  // forces the compact home layout below regardless of completion.
  if (lifecycleMode === "setup") {
    return (
      <SetupModeShell
        templateId={template.id}
        templateName={template.name}
        templateStatus={template.status}
        stages={stages}
        summaries={summaries}
        descriptions={descriptions}
        bodies={bodies}
        initialStageId={initialStageId}
        noAutoAdvanceStageIds={isCelebratingRun ? ["run"] : []}
      />
    );
  }

  // Home mode: every stage complete (or `?view=full`) -> the existing
  // compact one-page accordion, unchanged.
  return (
    <AgentLifecycleAccordion
      templateName={template.name}
      templateStatus={template.status}
      intro={`${formatTemplateType(template.type)} template — walk it through Learned, Verified, Connected, Run, then Sell.`}
      stages={stages}
      summaries={summaries}
      descriptions={descriptions}
      bodies={bodies}
      defaultOpenId={defaultOpenStageId(stages)}
    />
  );
}
