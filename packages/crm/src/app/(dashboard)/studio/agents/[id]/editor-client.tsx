"use client";

// ICP-3 — the Agent TEMPLATE editor (client).
//
// Reuses the voice-receptionist editor's section layout + interaction model
// (automations/voice-receptionist/editor-client.tsx): edits buffer client-side,
// "Save changes" sends the full patch to saveAgentTemplateBlueprintAction. The
// editable surface is the TEMPLATE blueprint — greeting, persona script
// (customSkillMd), TTS voice, tools, FAQ, guardrails (quoteRanges). Deployment-
// only controls (number assignment, Live/Pause, missed-call text-back) are
// intentionally NOT here: those belong to a deployment, configured per-client.
//
// Phase 2 (the AI-assisted builder) makes this editor SURFACE-AWARE: copy adapts
// to voice vs chat, the TTS section hides on chat (chat has no voice), and a
// "Refine with a prompt" card lets the builder iterate the whole config in
// natural language (generateAgentDraftAction → merge the returned patch into
// local state → review → Save).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Plug,
  RefreshCw,
  Trash2,
  ChevronDown,
  Plus,
  Check,
  ShieldCheck,
  Send,
  AlertCircle,
  ArrowRight,
  FileCode2,
} from "lucide-react";
import {
  saveAgentTemplateBlueprintAction,
  generateAgentDraftAction,
} from "@/lib/agent-templates/actions";
import { sendTestEventAgentAction } from "@/lib/agents/triggers/actions";
import { recordGeneratorEditAction } from "@/lib/agents/generate/actions";
import type { AgentBlueprint } from "@/db/schema/agents";
import {
  bindTemplateConnectorAction,
  unbindTemplateConnectorAction,
  setTemplateConnectorToolsAction,
  refreshTemplateConnectorAction,
  setTemplateComposioToolkitsAction,
  connectedToolsAction,
} from "@/lib/agent-templates/template-mcp-server";
import type { ToolConnectionStatus } from "@/lib/agents/mcp/tool-connection";
import type { AgentSurface } from "@/lib/agent-templates/store";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";
import {
  toolCatalogForUi,
  type ToolCatalogUiEntry,
} from "@/lib/agents/generate/tool-catalog";
import {
  KNOWN_EVENTS,
  type AgentTrigger,
} from "@/lib/agents/triggers/agent-trigger";
import { VOICE_OPTIONS } from "@/lib/agents/voice/card-status";
import type { Guardrails } from "@/lib/agents/guardrails/agent-guardrails";
import type { VerifyRubric } from "@/lib/agents/verify/agent-verify";
import {
  buildGuardrailsVerifyPatch,
  describeGuardrailsDefault,
  describeVerifyDefault,
  guardrailFieldsFrom,
  skillForTriggerEvent,
  verifyFieldsFrom,
  type GuardrailFields,
  type VerifyFields,
} from "./guardrails-fields";
import { EditorSection, EditorSectionDivider } from "./editor-section";

// Rotating status copy shown on the Refine button while a refinement is being
// generated, so the multi-second LLM call feels alive. Cycled every
// REFINE_STATUS_INTERVAL_MS.
const REFINE_STATUS_MESSAGES = [
  "Drafting the persona…",
  "Choosing the right tools…",
  "Writing the guardrails…",
  "Adding starter FAQs…",
  "Polishing the greeting…",
];
const REFINE_STATUS_INTERVAL_MS = 1500;

type FaqRow = { q: string; a: string };
type QuoteRange = { service: string; low: string; high: string };

/** Minimal serializable vetted-connector descriptor passed from the server. */
type VettedConnectorOption = { id: string; label: string; secretService: string };

type Props = {
  templateId: string;
  surface: AgentSurface;
  /** True when the editor was opened straight from the generate-by-default flow
   *  (`?new=1`). Arms the L5.3 edit-capture: the FIRST save records what the
   *  operator changed about the as-generated agent as a generator lesson, so the
   *  next generation learns from the correction. Any other entry → false → no
   *  capture, byte-for-byte today's save flow. */
  isNew?: boolean;
  /** The agent's resolved trigger (unified agent model P1) — what FIRES it.
   *  Already clamped to a valid AgentTrigger by resolveAgentTrigger on the
   *  server, so the picker can trust its shape. */
  initialTrigger: AgentTrigger;
  initialBlueprint: {
    greeting: string;
    customSkillMd: string;
    voice: string;
    capabilities: string[];
    faq: FaqRow[];
    quoteRanges: Array<{ service: string; low: number; high: number }>;
    connectors: ConnectorBinding[];
    /** The agent's saved L3 guardrails override, or null when unset (→ the
     *  per-skill smart default applies at runtime). Seeds the "Use smart
     *  defaults" toggle (null → ON). */
    guardrails: Guardrails | null;
    /** The agent's saved L2 verify rubric override, or null when unset (→ the
     *  per-skill smart default applies at runtime). */
    verify: VerifyRubric | null;
  };
  allCapabilities: string[];
  /** The shipped vetted connectors (id + label + secret service) for the Add form. */
  vettedConnectors: VettedConnectorOption[];
  /** T4 (page restructure) — when true, the script.md editor renders
   *  COLLAPSED by default (a header row: name + char count + "Show full
   *  script" expander) instead of the always-open textarea. Only the
   *  lifecycle-ladder page (SF_AGENT_LIFECYCLE) passes this; the flag-off
   *  editor page never sets it, so its render stays byte-for-byte identical
   *  to before. */
  collapsibleScript?: boolean;
};

// ─── trigger picker options (unified agent model P1) ────────────────────────
//
// The three "Answers when…" arms + the channels each kind allows. These mirror
// the AgentTrigger union in lib/agents/triggers/agent-trigger.ts (inbound:
// voice/chat/email/sms · event: sms/email · schedule: email/digest). Kept here
// (not exported from the pure module) because they're UI-shaped: label + the
// allowed channel list per kind, used to drive the picker's selects.
type TriggerKind = AgentTrigger["kind"];

const TRIGGER_KIND_OPTIONS: { value: TriggerKind; label: string; help: string }[] = [
  {
    value: "inbound",
    label: "Someone contacts the business",
    help: "It answers an incoming call, chat, text, or email.",
  },
  {
    value: "event",
    label: "Something happens",
    help: "It fires after a business event — like a booking finishing or a new lead.",
  },
  {
    value: "schedule",
    label: "On a schedule",
    help: "It runs on a recurring cadence and sends an update.",
  },
];

// The channel <select> options per kind. Value is the AgentTrigger channel; the
// label is operator-facing.
const CHANNELS_BY_KIND: Record<TriggerKind, { value: string; label: string }[]> = {
  inbound: [
    { value: "voice", label: "Voice (phone)" },
    { value: "chat", label: "Web chat" },
    { value: "sms", label: "SMS" },
    { value: "email", label: "Email" },
  ],
  event: [
    { value: "sms", label: "SMS" },
    { value: "email", label: "Email" },
  ],
  schedule: [
    { value: "email", label: "Email" },
    { value: "digest", label: "Digest" },
  ],
};

/** The "Send timing" choices for an event agent (F2 send delay). Value =
 *  delayMinutes written to the trigger; 0 = send immediately (today's behavior). */
const SEND_TIMING_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Immediately" },
  { value: 60, label: "1 hour after" },
  { value: 240, label: "4 hours after" },
  { value: 1440, label: "24 hours after" },
  { value: 2880, label: "48 hours after" },
];

/** Assemble the loose trigger patch the save action sends. Carries only the
 *  fields the chosen kind needs (event slug + send delay for event, cron for
 *  schedule), so the server's resolveAgentTrigger gets a clean shape to
 *  validate/clamp. `delayMinutes` is only sent for event triggers, and only when
 *  non-zero (0 = immediate = omit, so an inbound/schedule trigger never carries it). */
function buildTriggerPatch(
  kind: TriggerKind,
  channel: string,
  event: string,
  cron: string,
  delayMinutes: number,
): {
  kind: TriggerKind;
  channel: string;
  event?: string;
  cron?: string;
  delayMinutes?: number;
} {
  if (kind === "event") {
    return delayMinutes > 0
      ? { kind, channel, event, delayMinutes }
      : { kind, channel, event };
  }
  if (kind === "schedule") return { kind, channel, cron };
  return { kind, channel };
}

// ─── surface-aware copy ────────────────────────────────────────────────────
//
// One small helper so the editor never hardcodes "receptionist" / "call". Voice
// and chat share the same fields but read very differently to a builder.
function copy(surface: AgentSurface) {
  const isVoice = surface === "voice";
  return {
    greetingHelp: isVoice
      ? "The first thing it says when it answers a call. Each client that deploys this template starts from this greeting."
      : "The first message it sends when a conversation opens. Each client that deploys this template starts from this greeting.",
    greetingPlaceholder: isVoice
      ? "Thanks for calling! How can I help you today?"
      : "Hi! How can I help you today?",
    scriptTitle: "Agent script",
    scriptHelp: isVoice
      ? "The agent's core instructions — what it says and does on every call. This is the heart of your template."
      : "The agent's core instructions — what it says and does in every conversation. This is the heart of your template.",
    scriptPlaceholder: isVoice
      ? "You are the receptionist for {business}. You are warm, concise, and helpful…"
      : "You are the chat assistant for {business}. You are warm, concise, and helpful…",
    toolsHelp: isVoice
      ? "What the agent is allowed to do on a call. These carry into every deployment of this template."
      : "What the agent is allowed to do in a conversation. These carry into every deployment of this template.",
    faqHelp: isVoice
      ? "Question/answer pairs the agent uses to answer common questions on a call."
      : "Question/answer pairs the agent uses to answer common questions in a conversation.",
  };
}

export function AgentTemplateEditor(props: Props) {
  const router = useRouter();
  const c = copy(props.surface);
  const isChat = props.surface === "chat";

  const [greeting, setGreeting] = useState(props.initialBlueprint.greeting);
  const [customSkillMd, setCustomSkillMd] = useState(
    props.initialBlueprint.customSkillMd,
  );
  // T4 — collapsed by default ONLY when the caller opts in (collapsibleScript);
  // the flag-off editor page never passes it, so `scriptExpanded` starts (and
  // stays, since nothing ever flips it) true there — same always-open render.
  const [scriptExpanded, setScriptExpanded] = useState(!props.collapsibleScript);
  const [voice, setVoice] = useState(props.initialBlueprint.voice);
  const [capabilities, setCapabilities] = useState<string[]>(
    props.initialBlueprint.capabilities,
  );
  const [faq, setFaq] = useState<FaqRow[]>(props.initialBlueprint.faq);
  // Quote ranges are edited as strings (text inputs) and coerced to numbers on
  // save — mirrors the FAQ rows UX and avoids NaN churn while typing.
  const [quoteRanges, setQuoteRanges] = useState<QuoteRange[]>(
    props.initialBlueprint.quoteRanges.map((r) => ({
      service: r.service,
      low: String(r.low),
      high: String(r.high),
    })),
  );

  // ── Guardrails & quality (F5) — the L3 brakes + L2 verify overrides ──
  // The toggles default ON (= "use smart defaults") when the blueprint carries no
  // override, so the per-skill runtime defaults (defaultGuardrailsForSkill /
  // defaultRubricForSkill) apply. `hadGuardrails`/`hadVerify` capture whether the
  // LOADED blueprint already had an override, so a defaults-ON save knows whether
  // it must emit a `null` clear (there's something to clear) or omit the key.
  const hadGuardrails = props.initialBlueprint.guardrails != null;
  const hadVerify = props.initialBlueprint.verify != null;
  const [guardrailsDefaultsOn, setGuardrailsDefaultsOn] = useState(!hadGuardrails);
  const [verifyDefaultsOn, setVerifyDefaultsOn] = useState(!hadVerify);
  const [guardrailFields, setGuardrailFields] = useState<GuardrailFields>(() =>
    guardrailFieldsFrom(props.initialBlueprint.guardrails),
  );
  const [verifyFields, setVerifyFields] = useState<VerifyFields>(() =>
    verifyFieldsFrom(props.initialBlueprint.verify),
  );

  // ── Trigger (unified agent model P1) — what FIRES this agent ──
  // Seed each axis from the resolved initialTrigger. We keep one channel value
  // and reconcile it against the kind's allowed list when the kind changes (so
  // switching inbound→event never strands an invalid channel like "voice").
  const [triggerKind, setTriggerKind] = useState<TriggerKind>(
    props.initialTrigger.kind,
  );
  const [triggerChannel, setTriggerChannel] = useState<string>(
    props.initialTrigger.channel,
  );
  const [triggerEvent, setTriggerEvent] = useState<string>(
    props.initialTrigger.kind === "event"
      ? props.initialTrigger.event
      : (KNOWN_EVENTS[0]?.value ?? "booking.completed"),
  );
  // The schedule cron isn't editable in P1 (no cron builder yet); we preserve
  // the seeded value so a schedule trigger round-trips without loss.
  const [triggerCron] = useState<string>(
    props.initialTrigger.kind === "schedule"
      ? props.initialTrigger.cron
      : "0 8 * * 1",
  );
  // F2 (send delay) — for an event trigger, WHEN the outbound send fires relative
  // to the event (0 = immediately). Seeded from the resolved trigger; only event
  // triggers carry it, so default to 0 (immediate) for inbound/schedule.
  const [triggerDelayMinutes, setTriggerDelayMinutes] = useState<number>(
    props.initialTrigger.kind === "event"
      ? props.initialTrigger.delayMinutes ?? 0
      : 0,
  );

  // Change the kind AND snap the channel into that kind's allowed set if the
  // current one isn't valid for it (e.g. inbound "voice" → event must become
  // "sms"). Keeps the picker from ever holding a channel the kind can't speak.
  const changeTriggerKind = (kind: TriggerKind) => {
    setTriggerKind(kind);
    const allowed = CHANNELS_BY_KIND[kind];
    if (!allowed.some((o) => o.value === triggerChannel)) {
      setTriggerChannel(allowed[0]!.value);
    }
  };

  const [isSaving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── L5.3 self-improving loop — capture the operator's FIRST edit of a freshly
  //    generated agent as a generator lesson. We snapshot the AS-GENERATED slice
  //    (trigger + custom script presence — the only axes the generator decides /
  //    the lesson keys on) at mount, BEFORE any edit, then on the first
  //    successful save compare it to what was saved and record the diff. Refs (no
  //    re-render): the snapshot is captured once and the capture fires at most
  //    once. Best-effort + non-blocking — it never gates the real save. ──
  const genBeforeRef = useRef<AgentBlueprint>({
    trigger: props.initialTrigger,
    customSkillMd: props.initialBlueprint.customSkillMd.trim() || undefined,
  });
  const editCapturedRef = useRef(false);

  // ── Refine with a prompt ──
  const [refinePrompt, setRefinePrompt] = useState("");
  const [isRefining, startRefine] = useTransition();
  const [refineError, setRefineError] = useState<React.ReactNode | null>(null);
  const [refined, setRefined] = useState(false);

  // Rotating loader copy index for the Refine button. Resets to 0 when a
  // refinement starts, advances on an interval while pending, and clears the
  // interval when pending ends or the component unmounts. Plain client timer.
  const [refineStatusIdx, setRefineStatusIdx] = useState(0);
  useEffect(() => {
    if (!isRefining) return;
    setRefineStatusIdx(0);
    const id = setInterval(() => {
      setRefineStatusIdx((i) => (i + 1) % REFINE_STATUS_MESSAGES.length);
    }, REFINE_STATUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isRefining]);

  const save = () => {
    setSaveError(null);
    setSaved(false);
    // L3 guardrails + L2 verify (F5). Defaults-ON omits the key (or sends `null`
    // to clear a prior override) so the per-skill runtime default applies; OFF
    // sends the constructed override. Spread so an omitted field is truly absent.
    const guardrailsVerifyPatch = buildGuardrailsVerifyPatch({
      guardrailsDefaultsOn,
      verifyDefaultsOn,
      guardrails: guardrailFields,
      verify: verifyFields,
      hadGuardrails,
      hadVerify,
    });
    startSave(async () => {
      const result = await saveAgentTemplateBlueprintAction({
        templateId: props.templateId,
        patch: {
          greeting: greeting.trim() || undefined,
          customSkillMd: customSkillMd.trim() || undefined,
          // Voice is a TTS-only concept; never send it from a chat template.
          ...(isChat ? {} : { voice }),
          capabilities,
          faq: faq.filter((r) => r.q.trim() && r.a.trim()),
          quoteRanges: quoteRanges
            .filter((r) => r.service.trim() !== "")
            .map((r) => ({
              service: r.service.trim(),
              low: Number(r.low) || 0,
              high: Number(r.high) || 0,
            })),
          // What FIRES the agent. Send only the fields the kind needs; the
          // server normalizes (resolveAgentTrigger) any loose shape to a valid
          // AgentTrigger before persisting.
          trigger: buildTriggerPatch(
            triggerKind,
            triggerChannel,
            triggerEvent,
            triggerCron,
            triggerDelayMinutes,
          ),
          // Guardrails & quality overrides (omitted/null when defaults-on).
          ...guardrailsVerifyPatch,
        },
      });
      if (!result.ok) {
        setSaveError(result.error);
      } else {
        setSaved(true);
        // L5.3 — first save of a just-generated agent: record what the operator
        // changed (vs the as-generated snapshot) as a generator lesson. Fire-and-
        // forget; never blocks or fails the save. Guarded so it runs at most once.
        if (props.isNew && !editCapturedRef.current) {
          editCapturedRef.current = true;
          const after: AgentBlueprint = {
            trigger: buildTriggerPatch(
              triggerKind,
              triggerChannel,
              triggerEvent,
              triggerCron,
              triggerDelayMinutes,
            ) as AgentBlueprint["trigger"],
            customSkillMd: customSkillMd.trim() || undefined,
          };
          void recordGeneratorEditAction({
            agentTemplateId: props.templateId,
            before: genBeforeRef.current,
            after,
          }).catch(() => {});
        }
        router.refresh();
      }
    });
  };

  // Merge a generated patch into local state — set each field ONLY if present
  // in the patch, so a partial refinement never wipes fields the builder
  // already has. The builder then reviews the updated fields and Saves.
  const refine = () => {
    setRefineError(null);
    setRefined(false);
    const intent = refinePrompt.trim();
    if (!intent) {
      setRefineError("Describe the change you want first.");
      return;
    }
    startRefine(async () => {
      const draft = await generateAgentDraftAction({
        prompt: intent,
        surface: props.surface,
      });
      if (!draft.ok) {
        if (draft.error === "needs_byok") {
          setRefineError(
            <span>
              {draft.message ??
                "Add your Anthropic key to build + test agents — your first workspace stays free."}{" "}
              <Link
                href="/settings/integrations/llm"
                className="font-medium underline underline-offset-2 hover:opacity-80"
              >
                Add your key &rarr;
              </Link>
            </span>,
          );
        } else if (draft.error === "generation_failed") {
          setRefineError("Couldn't generate — try rephrasing.");
        } else {
          setRefineError("Something went wrong. Please try again.");
        }
        return;
      }
      const patch = draft.patch;
      if (patch.greeting !== undefined) setGreeting(patch.greeting);
      if (patch.customSkillMd !== undefined) setCustomSkillMd(patch.customSkillMd);
      if (patch.capabilities !== undefined) setCapabilities(patch.capabilities);
      if (patch.faq !== undefined) {
        setFaq(patch.faq.map((r) => ({ q: r.q, a: r.a })));
      }
      if (patch.quoteRanges !== undefined) {
        setQuoteRanges(
          patch.quoteRanges.map((r) => ({
            service: r.service,
            low: String(r.low),
            high: String(r.high),
          })),
        );
      }
      setRefined(true);
      setRefinePrompt("");
    });
  };

  const toggleCap = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  };

  // The script textarea + its Refine footer — factored out so the
  // collapsibleScript branch below can wrap it in a visibility-toggling
  // <div> without duplicating the JSX (F-A/F-B fix).
  const scriptBody = (
    <>
      <textarea
        id="agent-script"
        value={customSkillMd}
        onChange={(e) => setCustomSkillMd(e.target.value)}
        spellCheck={false}
        rows={16}
        className="block min-h-[300px] w-full resize-y border-0 bg-muted/20 px-5 py-4 font-mono text-[13px] leading-7 text-foreground focus:outline-none"
        placeholder={c.scriptPlaceholder}
      />
      {/* Refine footer — AI-assisted iteration over the whole config. */}
      <div className="flex items-center gap-2.5 border-t border-border/70 bg-card px-3 py-2.5">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          <Sparkles className="size-4" />
        </span>
        <input
          type="text"
          value={refinePrompt}
          onChange={(e) => setRefinePrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isRefining) refine();
          }}
          disabled={isRefining}
          placeholder="Refine in plain language — e.g. add an FAQ about emergency service"
          className="h-9 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-foreground focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={refine}
          disabled={isRefining}
          className="crm-button-secondary inline-flex h-9 shrink-0 items-center gap-1.5 px-4 text-sm"
        >
          <Sparkles className={`size-4 ${isRefining ? "animate-pulse" : ""}`} />
          {isRefining ? REFINE_STATUS_MESSAGES[refineStatusIdx] : "Refine"}
        </button>
      </div>
    </>
  );

  return (
    <div>
      {/* ── 01 · When it runs ─────────────────────────────────────────────
          What FIRES this agent (Trigger × Channel), plus the event-only
          "Send test" affordance. */}
      <EditorSection
        step="01"
        title="When it runs"
        anchor="trigger"
        description="Choose what wakes the agent and the channel it answers on. Each client that deploys this template inherits this."
      >
        {/* Trigger — what FIRES this agent (Trigger × Channel). Defaults to
            inbound on the template's surface, so existing templates read as today. */}
        <TriggerCard
          kind={triggerKind}
          channel={triggerChannel}
          event={triggerEvent}
          delayMinutes={triggerDelayMinutes}
          onChangeKind={changeTriggerKind}
          onChangeChannel={setTriggerChannel}
          onChangeEvent={setTriggerEvent}
          onChangeDelayMinutes={setTriggerDelayMinutes}
        />

        {/* Send test — outbound (event) agents only. Fire a REAL "[TEST] "
            review/speed-to-lead message to your own number/email NOW, no booking
            or lead required. Bypasses the throttle/guardrails/verify gates (it's an
            explicit operator action). A review test never blocks on a missing
            review link — the Google review link is a per-buyer, deploy-time
            customization (each client sets their own when they deploy this
            template), so the test falls back to a placeholder link and the UI
            notes it. Shown for kind=event; uses the CURRENTLY-SELECTED channel —
            save first if you just switched channels so the test matches what
            you'll deploy. */}
        {triggerKind === "event" && (
          <SendTestCard templateId={props.templateId} channel={triggerChannel} />
        )}
      </EditorSection>

      <EditorSectionDivider />

      {/* ── 02 · What it says & does ──────────────────────────────────────
          The heart of the template: the greeting that opens every
          conversation, the agent script (its core instructions), the
          Refine-with-a-prompt affordance folded into the script editor, the
          TTS voice (voice templates), and the FAQ. */}
      <EditorSection
        step="02"
        title="What it says & does"
        anchor="script"
        description="The greeting opens every conversation; the script is the agent's core instructions. Refine either in plain language."
      >
        {/* Greeting */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Greeting</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{c.greetingHelp}</p>
          <textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            rows={2}
            className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder={c.greetingPlaceholder}
          />
        </div>

        {/* Agent script (core persona — blueprint.customSkillMd) — a breathing
            monospace editor: a quiet chrome bar (filename · Markdown badge · live
            char count), the mono textarea, and a footer that folds in the
            "Refine with a prompt" control (AI-assisted iteration over the whole
            config). */}
        <div>
          <label
            htmlFor="agent-script"
            className="mb-2 block text-sm font-semibold text-foreground"
          >
            {c.scriptTitle}
          </label>
          <p className="mb-3 text-xs text-muted-foreground">{c.scriptHelp}</p>
          <div className="overflow-hidden rounded-xl border bg-card shadow-(--shadow-xs)">
            {/* chrome bar — always visible; doubles as the collapsed header
                row (name + char count + expander) when collapsibleScript. */}
            <div className="flex items-center gap-2.5 border-b border-border/70 bg-muted/40 px-3.5 py-2.5">
              <FileCode2
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
              <span className="font-mono text-xs font-medium text-muted-foreground">
                script.md
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                Markdown
              </span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {customSkillMd.length.toLocaleString()} chars
              </span>
              {props.collapsibleScript ? (
                <button
                  type="button"
                  onClick={() => setScriptExpanded((v) => !v)}
                  className="crm-button-secondary h-6 shrink-0 px-2 text-[11px]"
                >
                  {scriptExpanded ? "Hide script" : "Show full script"}
                </button>
              ) : null}
            </div>
            {/* F-A/F-B fix: ALWAYS mounted (never conditionally rendered
                null) — the label above (htmlFor="agent-script") must always
                point at a present element; pointing at an unmounted
                textarea while collapsed is a broken a11y association.
                Visibility toggles via `hidden` instead. Only wrapped in the
                extra toggle <div> when collapsibleScript is actually in
                play (collapsibleScript=false ⇒ scriptExpanded is always
                true and never flips), so the flag-off editor page's DOM
                stays byte-for-byte what it was — no extra wrapper node. */}
            {props.collapsibleScript ? (
              <div className={scriptExpanded ? "" : "hidden"}>{scriptBody}</div>
            ) : (
              scriptBody
            )}
          </div>
          {refined && (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
              ✓ Updated the fields below — review and Save.
            </p>
          )}
          {refineError && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
              {refineError}
            </p>
          )}
        </div>

        {/* TTS voice — voice templates only (chat has no TTS) */}
        {!isChat && (
          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Voice</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The text-to-speech voice the agent speaks with.
            </p>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="mt-3 w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm capitalize focus:border-primary focus:outline-none"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v} value={v} className="capitalize">
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* FAQ */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">FAQ</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{c.faqHelp}</p>
            </div>
            <button
              type="button"
              onClick={() => setFaq([...faq, { q: "", a: "" }])}
              className="crm-button-secondary h-8 px-3 text-xs"
            >
              + Add row
            </button>
          </div>
          {faq.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No FAQ yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {faq.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-md border bg-background p-3 sm:grid-cols-[1fr_2fr_auto]"
                >
                  <input
                    type="text"
                    placeholder="Question"
                    value={row.q}
                    onChange={(e) => {
                      const next = [...faq];
                      next[idx] = { ...next[idx], q: e.target.value };
                      setFaq(next);
                    }}
                    className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                  />
                  <textarea
                    placeholder="Answer"
                    value={row.a}
                    rows={2}
                    onChange={(e) => {
                      const next = [...faq];
                      next[idx] = { ...next[idx], a: e.target.value };
                      setFaq(next);
                    }}
                    className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setFaq(faq.filter((_, i) => i !== idx))}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </EditorSection>

      <EditorSectionDivider />

      {/* ── 03 · Tools ────────────────────────────────────────────────────
          The native capabilities the agent may use, plus the external apps it
          can act in (Apps & tools / connectors / booking actions). */}
      <EditorSection
        step="03"
        title="Tools"
        anchor="tools"
        description="Pick what the agent is allowed to do, and connect the apps it can act in. These carry into every deployment."
      >
        {/* Tool toggles (native capabilities) */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">
            Built-in tools
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{c.toolsHelp}</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {props.allCapabilities.map((cap) => (
              <label
                key={cap}
                className="flex cursor-pointer items-center gap-2 rounded-md border bg-background p-3 text-sm hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={capabilities.includes(cap)}
                  onChange={() => toggleCap(cap)}
                />
                <code className="font-mono text-xs">{cap}</code>
              </label>
            ))}
          </div>
        </div>

        {/* Connectors & Tools — bind external MCP servers (#3) */}
        <ConnectorsCard
          templateId={props.templateId}
          surface={props.surface}
          initialConnectors={props.initialBlueprint.connectors}
          vettedConnectors={props.vettedConnectors}
        />
      </EditorSection>

      <EditorSectionDivider />

      {/* ── 04 · Quality & guardrails ─────────────────────────────────────
          The brakes that keep the agent safe and on-message: the quote ranges
          it may give, plus the L3 guardrails + L2 verify gates. */}
      <EditorSection
        step="04"
        title="Quality & guardrails"
        anchor="guardrails"
        description="Brakes that keep the agent safe and on-message. Smart defaults are on — adjust only if you need to."
      >
        {/* Quote ranges for the get_quote_range tool */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Quote ranges
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Price ranges the agent may quote. It never states a firm price —
                it gives this low–high band and says a human confirms the final
                number. A service with no range here gets a &ldquo;we&apos;ll
                confirm&rdquo; answer.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setQuoteRanges([
                  ...quoteRanges,
                  { service: "", low: "", high: "" },
                ])
              }
              className="crm-button-secondary h-8 shrink-0 px-3 text-xs"
            >
              + Add range
            </button>
          </div>
          {quoteRanges.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No quote ranges yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {quoteRanges.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-md border bg-background p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
                >
                  <input
                    type="text"
                    placeholder="Service (e.g. Drain cleaning)"
                    value={row.service}
                    onChange={(e) => {
                      const next = [...quoteRanges];
                      next[idx] = { ...next[idx], service: e.target.value };
                      setQuoteRanges(next);
                    }}
                    className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Low $"
                    value={row.low}
                    onChange={(e) => {
                      const next = [...quoteRanges];
                      next[idx] = { ...next[idx], low: e.target.value };
                      setQuoteRanges(next);
                    }}
                    className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="High $"
                    value={row.high}
                    onChange={(e) => {
                      const next = [...quoteRanges];
                      next[idx] = { ...next[idx], high: e.target.value };
                      setQuoteRanges(next);
                    }}
                    className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setQuoteRanges(quoteRanges.filter((_, i) => i !== idx))
                    }
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Guardrails & quality (F5) — the L3 brakes + L2 verify overrides. Most
            meaningful for outbound/event agents, but shown for all (the gates apply
            to event agents today). */}
        <GuardrailsCard
          skill={skillForTriggerEvent(triggerEvent)}
          channel={triggerChannel}
          guardrailsDefaultsOn={guardrailsDefaultsOn}
          verifyDefaultsOn={verifyDefaultsOn}
          onToggleGuardrailsDefaults={setGuardrailsDefaultsOn}
          onToggleVerifyDefaults={setVerifyDefaultsOn}
          guardrails={guardrailFields}
          verify={verifyFields}
          onChangeGuardrails={setGuardrailFields}
          onChangeVerify={setVerifyFields}
        />
      </EditorSection>

      {/* ── Save ── A calm, prominent primary action. The save-state (dirty /
          saved / error) is wired here in the client island; the sticky header's
          Deploy actions sit alongside it conceptually. */}
      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border/70 pt-6">
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="crm-button-primary h-10 px-6 text-sm"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
        <p className="text-xs text-muted-foreground">
          Saves your changes to this template. Use Test to try it in the sandbox,
          then Deploy to set it up for a client.
        </p>
        {saved && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            ✓ Saved.
          </span>
        )}
        {saveError && (
          <span className="text-xs text-rose-600">Error: {saveError}</span>
        )}
      </div>
    </div>
  );
}

// ─── Trigger (unified agent model P1 — "What kind of agent?") ────────────────
//
// Generalizes the old read-only Surfaces card. An agent is Trigger × Channel:
// the builder picks WHEN it answers (inbound / event / schedule), then the
// CHANNEL it uses (filtered to what the kind allows). The default — inbound on
// the template's surface channel — keeps every existing template behaving
// exactly as before. For kind=event, a second select chooses which domain event
// (KNOWN_EVENTS) fires it. Cron editing is deferred (P2), so a schedule trigger
// keeps its seeded cadence on save.
function TriggerCard({
  kind,
  channel,
  event,
  delayMinutes,
  onChangeKind,
  onChangeChannel,
  onChangeEvent,
  onChangeDelayMinutes,
}: {
  kind: TriggerKind;
  channel: string;
  event: string;
  delayMinutes: number;
  onChangeKind: (k: TriggerKind) => void;
  onChangeChannel: (c: string) => void;
  onChangeEvent: (e: string) => void;
  onChangeDelayMinutes: (m: number) => void;
}) {
  const channelOptions = CHANNELS_BY_KIND[kind];
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="min-w-0">
        <h2 className="text-card-title">What triggers this agent?</h2>
        <p className="text-xs text-muted-foreground">
          Choose when it answers and the channel it uses. Each client that
          deploys this template inherits this.
        </p>
      </div>

      {/* "Answers when…" — the three trigger kinds as selectable cards. */}
      <fieldset className="mt-3">
        <legend className="sr-only">Answers when</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TRIGGER_KIND_OPTIONS.map((opt) => {
            const selected = kind === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChangeKind(opt.value)}
                aria-pressed={selected}
                className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "bg-background hover:bg-muted/50"
                }`}
              >
                <span className="text-sm font-medium text-foreground">
                  {opt.label}
                </span>
                <span className="text-xs text-muted-foreground">{opt.help}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Event picker — only for kind=event. */}
        {kind === "event" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">
              Which event
            </span>
            <select
              value={event}
              onChange={(e) => onChangeEvent(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {KNOWN_EVENTS.map((ev) => (
                <option key={ev.value} value={ev.value}>
                  {ev.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Channel — filtered to what the kind allows. */}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">
            Channel
          </span>
          <select
            value={channel}
            onChange={(e) => onChangeChannel(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            {channelOptions.map((ch) => (
              <option key={ch.value} value={ch.value}>
                {ch.label}
              </option>
            ))}
          </select>
        </label>

        {/* Send timing — event triggers only (F2 send delay). Lets an outbound
            agent fire its message a set time AFTER the event (e.g. the review
            ask 24h after the job), not the instant it fires. 0 = immediately. */}
        {kind === "event" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">
              Send timing
            </span>
            <select
              value={delayMinutes}
              onChange={(e) => onChangeDelayMinutes(Number(e.target.value))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {SEND_TIMING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              When the message goes out after the event fires.
            </span>
          </label>
        )}
      </div>
    </div>
  );
}

// ─── Send test (outbound/event agents) ──────────────────────────────────────
//
// A small form that fires a REAL test of this agent's outbound message to a
// number (SMS) or address (email) the operator types — typically their own — via
// sendTestEventAgentAction. No booking/lead is needed: it's the "make my phone
// fire a review request" affordance. The action bypasses the throttle/guardrails/
// verify gates (explicit operator action). A review test never blocks on a
// missing review link: the link is a per-buyer, deploy-time customization (each
// client sets their own when they deploy this template), so the test falls back
// to a placeholder link — `result.usedPlaceholder` flags that so we can show a
// non-blocking note instead of an error. The input shown matches the agent's
// current channel (phone vs email).
function SendTestCard({
  templateId,
  channel,
}: {
  templateId: string;
  channel: string;
}) {
  const isEmail = channel === "email";
  const [to, setTo] = useState("");
  const [isSending, startSend] = useTransition();
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [placeholderNote, setPlaceholderNote] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const send = () => {
    setOkMsg(null);
    setPlaceholderNote(false);
    setErrMsg(null);
    const dest = to.trim();
    if (!dest) {
      setErrMsg(isEmail ? "Enter an email address." : "Enter a phone number.");
      return;
    }
    startSend(async () => {
      const result = await sendTestEventAgentAction({
        agentTemplateId: templateId,
        ...(isEmail ? { toEmail: dest } : { toPhone: dest }),
      });
      if (result.ok) {
        setOkMsg(`Sent to ${result.to}: ${result.preview}`);
        setPlaceholderNote(Boolean(result.usedPlaceholder));
      } else {
        setErrMsg(result.error);
      }
    });
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-2">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
          aria-hidden
        >
          <Send className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-card-title">Send test</h2>
          <p className="text-xs text-muted-foreground">
            Fire a real{" "}
            <span className="font-medium text-foreground">
              {isEmail ? "email" : "text"}
            </span>{" "}
            of this agent&apos;s message to {isEmail ? "an address" : "a number"}{" "}
            you choose — no booking or lead needed. The message is prefixed with{" "}
            <code className="font-mono text-[11px]">[TEST]</code>. Save first if
            you just changed the channel.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type={isEmail ? "email" : "tel"}
          inputMode={isEmail ? "email" : "tel"}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isSending) send();
          }}
          disabled={isSending}
          placeholder={isEmail ? "you@example.com" : "+1 555 123 4567"}
          className="h-10 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={send}
          disabled={isSending}
          className="crm-button-secondary inline-flex h-10 shrink-0 items-center gap-1.5 px-4 text-sm"
        >
          <Send className={`size-4 ${isSending ? "animate-pulse" : ""}`} />
          {isSending ? "Sending…" : "Send test"}
        </button>
      </div>
      {okMsg && (
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
          ✓ {okMsg}
        </p>
      )}
      {placeholderNote && (
        <p className="mt-1 text-xs text-muted-foreground">
          The Google review link is set by each client when they deploy this
          template — your test uses a placeholder link.
        </p>
      )}
      {errMsg && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{errMsg}</p>
      )}
    </div>
  );
}

// ─── Guardrails & quality (F5) ───────────────────────────────────────────────
//
// One card holding BOTH the L3 guardrails (the per-agent brakes: kill switch /
// daily cap / per-contact frequency cap / quiet hours) and the L2 verify rubric
// (the maker≠checker quality gate). Each half opens with a "Use smart defaults"
// toggle: ON (the default for a fresh agent) leaves the blueprint key UNSET so the
// per-skill runtime default applies (and stays fresh); flipping it OFF reveals the
// fields and the save writes an explicit override. The hint copy shows what the
// smart default IS for this agent's skill so the builder knows what they're
// replacing. Pure form — all persistence is via the editor's existing blueprint
// save (buildGuardrailsVerifyPatch → saveAgentTemplateBlueprintAction).

function GuardrailsCard({
  skill,
  channel,
  guardrailsDefaultsOn,
  verifyDefaultsOn,
  onToggleGuardrailsDefaults,
  onToggleVerifyDefaults,
  guardrails,
  verify,
  onChangeGuardrails,
  onChangeVerify,
}: {
  skill: string | null;
  channel: string;
  guardrailsDefaultsOn: boolean;
  verifyDefaultsOn: boolean;
  onToggleGuardrailsDefaults: (on: boolean) => void;
  onToggleVerifyDefaults: (on: boolean) => void;
  guardrails: GuardrailFields;
  verify: VerifyFields;
  onChangeGuardrails: (next: GuardrailFields) => void;
  onChangeVerify: (next: VerifyFields) => void;
}) {
  const guardrailsHint = describeGuardrailsDefault(skill);
  const verifyHint = describeVerifyDefault(skill, channel);

  const patchG = (partial: Partial<GuardrailFields>) =>
    onChangeGuardrails({ ...guardrails, ...partial });

  const setMustInclude = (idx: number, value: string) => {
    const next = [...verify.mustInclude];
    next[idx] = value;
    onChangeVerify({ ...verify, mustInclude: next });
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-2">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
          aria-hidden
        >
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-card-title">Guardrails &amp; quality</h2>
          <p className="text-xs text-muted-foreground">
            The brakes that stop this agent from over-sending, plus the quality
            checks every outbound message must pass before it goes out. Smart
            defaults are on — only change these if you need to.
          </p>
        </div>
      </div>

      {/* ── Guardrails (L3 brakes) ── */}
      <div className="mt-4 rounded-lg border bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Guardrails</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {guardrailsHint
                ? `Default: ${guardrailsHint}.`
                : "No smart default for this agent — it sends with no extra brakes unless you set them."}
            </p>
          </div>
          <SmartDefaultToggle
            on={guardrailsDefaultsOn}
            onChange={onToggleGuardrailsDefaults}
            label="Use smart defaults"
          />
        </div>

        {!guardrailsDefaultsOn && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {/* Kill switch */}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={guardrails.enabled}
                onChange={(e) => patchG({ enabled: e.target.checked })}
              />
              <span className="font-medium text-foreground">Enabled</span>
              <span className="text-xs text-muted-foreground">
                Turn off to hard-stop every send from this agent.
              </span>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">
                  Max sends per day
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="No cap"
                  value={guardrails.maxPerDay}
                  onChange={(e) => patchG({ maxPerDay: e.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Leave blank for no daily cap.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">
                  Min hours between messages (same contact)
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="No limit"
                  value={guardrails.minHoursBetween}
                  onChange={(e) => patchG({ minHoursBetween: e.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Don&apos;t re-message the same person within this many hours.
                </span>
              </label>
            </div>

            {/* Quiet hours */}
            <div>
              <span className="mb-1 block text-xs font-medium text-foreground">
                Quiet hours
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto_1fr] sm:items-center">
                <label className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs text-muted-foreground">No messages from</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={23}
                    placeholder="21"
                    value={guardrails.quietStartHour}
                    onChange={(e) => patchG({ quietStartHour: e.target.value })}
                    className="w-16 rounded-md border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs text-muted-foreground">to</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={23}
                    placeholder="8"
                    value={guardrails.quietEndHour}
                    onChange={(e) => patchG({ quietEndHour: e.target.value })}
                    className="w-16 rounded-md border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                  <span className="text-xs text-muted-foreground">(24-hour clock)</span>
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs text-muted-foreground">Timezone</span>
                  <input
                    type="text"
                    placeholder="UTC"
                    value={guardrails.quietTz}
                    onChange={(e) => patchG({ quietTz: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </label>
              </div>
              <span className="mt-1 block text-xs text-muted-foreground">
                Leave the hours blank to allow messages at any time.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Quality checks (L2 verify) ── */}
      <div className="mt-3 rounded-lg border bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Quality checks</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {verifyHint
                ? `Default: ${verifyHint}.`
                : "No smart default for this agent — add your own checks to gate its messages."}
            </p>
          </div>
          <SmartDefaultToggle
            on={verifyDefaultsOn}
            onChange={onToggleVerifyDefaults}
            label="Use smart defaults"
          />
        </div>

        {!verifyDefaultsOn && (
          <div className="mt-3 space-y-3 border-t pt-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  Must include
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeVerify({
                      ...verify,
                      mustInclude: [...verify.mustInclude, ""],
                    })
                  }
                  className="crm-button-secondary h-7 px-2.5 text-xs"
                >
                  + Add
                </button>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Block the message unless it contains this exact text (e.g. the
                review link, the business name).
              </p>
              {verify.mustInclude.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No required text yet.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {verify.mustInclude.map((value, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Text the message must include"
                        value={value}
                        onChange={(e) => setMustInclude(idx, e.target.value)}
                        className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onChangeVerify({
                            ...verify,
                            mustInclude: verify.mustInclude.filter(
                              (_, i) => i !== idx,
                            ),
                          })
                        }
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="block max-w-xs">
              <span className="mb-1 block text-xs font-medium text-foreground">
                Max length (characters)
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="No limit"
                value={verify.maxLength}
                onChange={(e) =>
                  onChangeVerify({ ...verify, maxLength: e.target.value })
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Block messages longer than this. Leave blank for no limit.
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

/** A small on/off pill toggle for the "Use smart defaults" switches. */
function SmartDefaultToggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-foreground"
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          on ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className="text-muted-foreground">{label}</span>
    </button>
  );
}

// ─── Connectors & Tools (#3) ────────────────────────────────────────────────
//
// Binds external MCP servers (vetted Postiz / BYO HTTPS endpoint) onto the
// TEMPLATE blueprint via the template-scoped MCP actions, then lists each
// binding with per-tool enable toggles + Refresh/Remove. Connectors give the
// agent external tools at runtime (the getToolsForCapabilities seam appends them
// to the native list). Voice (realtime) is native-only, so the help copy is
// honest: connectors apply to chat / SMS / email agents.
//
// SECURITY: the API key is collected, submitted, and immediately cleared from
// state on success — it is NEVER rendered back, stored in component state beyond
// the in-flight submit, or logged. The server stores it encrypted; only the
// (non-secret) discovered tool schemas come back to render here.
function ConnectorsCard({
  templateId,
  surface,
  initialConnectors,
  vettedConnectors,
}: {
  templateId: string;
  surface: AgentSurface;
  initialConnectors: ConnectorBinding[];
  vettedConnectors: VettedConnectorOption[];
}) {
  const router = useRouter();
  const isVoice = surface === "voice";

  // Bound connectors render from props (server is source of truth); after each
  // mutation we router.refresh() so the server re-supplies the canonical list.
  // The single managed Composio binding is rendered by its own picker below, so
  // exclude it from the generic vetted/byo connector list.
  const connectors = initialConnectors.filter((b) => b.kind !== "composio");
  const composioBinding = initialConnectors.find((b) => b.kind === "composio");
  const composioEnabledToolkits =
    composioBinding && composioBinding.kind === "composio"
      ? composioBinding.enabledToolkits
      : [];

  // ── Add-connector form state ──
  const [adding, setAdding] = useState(false);
  // "postiz" (vetted id) or "byo". Default to the first vetted connector.
  const [choice, setChoice] = useState<string>(vettedConnectors[0]?.id ?? "byo");
  const [byoEndpoint, setByoEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isBinding, startBind] = useTransition();
  const [bindError, setBindError] = useState<string | null>(null);

  const isByo = choice === "byo";
  const byoValid = (() => {
    const v = byoEndpoint.trim();
    if (!v) return false;
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  })();
  const canConnect =
    apiKey.trim().length > 0 && (!isByo || byoValid) && !isBinding;

  const connect = () => {
    setBindError(null);
    const key = apiKey.trim();
    startBind(async () => {
      // Build the #2 BindConnectorInput. A BYO serviceName is namespaced so it
      // never collides with a vetted secret slot.
      const connector = isByo
        ? ({
            kind: "byo" as const,
            id: slugForByo(byoEndpoint),
            serviceName: `byo_${slugForByo(byoEndpoint)}`,
            endpoint: byoEndpoint.trim(),
          })
        : (() => {
            const vetted = vettedConnectors.find((c) => c.id === choice)!;
            return {
              kind: "vetted" as const,
              id: vetted.id,
              serviceName: vetted.secretService,
            };
          })();

      const result = await bindTemplateConnectorAction({
        templateId,
        connector,
        apiKey: key,
      });
      // Clear the key from state regardless of outcome — never keep it around.
      setApiKey("");
      if (!result.ok) {
        setBindError(friendlyBindError(result.error));
        return;
      }
      setByoEndpoint("");
      setAdding(false);
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-2">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
          aria-hidden
        >
          <Plug className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-card-title">Connectors &amp; Tools</h2>
          <p className="text-xs text-muted-foreground">
            Connectors give this agent external tools (e.g. Postiz to publish
            social posts).{" "}
            <span className="font-medium text-foreground">
              Available on chat / SMS / email agents
            </span>{" "}
            — voice agents use built-in tools only.
          </p>
        </div>
      </div>

      {isVoice && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          This is a voice template. Connectors won&apos;t run on calls (the voice
          runtime is native-only) — they apply when this agent answers chat, SMS,
          or email.
        </p>
      )}

      {/* Apps & tools — per-agent app picker driven by the shared tool catalog
          (the same set the generator authors from) + the vetted Postiz "post to
          social" tool. */}
      <ComposioAppsSection
        templateId={templateId}
        initialEnabled={composioEnabledToolkits}
        onChanged={() => router.refresh()}
        disabled={isVoice}
        postizBound={connectors.some(
          (b) => b.kind === "vetted" && b.id === "postiz",
        )}
        onAddPostiz={() => {
          setChoice("postiz");
          setBindError(null);
          setAdding(true);
        }}
      />

      {/* P2.1-T3 — connect-the-tools CTA. A generated agent BINDS tools (Postiz /
          Calendar) before the workspace has CONNECTED them; this calls the server
          (the same money-safe predicate the runtime fires on) and prompts the
          operator to connect each bound-but-unconnected one. Voice agents don't run
          connectors, so it's hidden there (the picker is already inert). */}
      {!isVoice && (
        <ConnectToolsBanner
          templateId={templateId}
          // Re-fetch whenever the bound set changes (after a connect/remove);
          // the key folds the binding ids so a mutation re-runs the effect.
          bindingKey={initialConnectors.map((b) => b.id).join(",")}
        />
      )}

      {/* Bound connectors */}
      {connectors.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          No connectors yet. Add one below to give this agent external tools.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {connectors.map((binding) => (
            <ConnectorRow
              key={binding.id}
              templateId={templateId}
              binding={binding}
              onChanged={() => router.refresh()}
            />
          ))}
        </ul>
      )}

      {/* Add connector */}
      <div className="mt-4 border-t pt-4">
        {!adding ? (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setBindError(null);
            }}
            className="crm-button-secondary inline-flex h-9 items-center gap-1.5 px-3 text-sm"
          >
            <Plus className="size-4" />
            Add connector
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border bg-background p-4">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">
                Connector
              </span>
              <select
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                disabled={isBinding}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
              >
                {vettedConnectors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                <option value="byo">Custom MCP (bring your own endpoint)</option>
              </select>
            </div>

            {isByo && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-foreground">
                  MCP endpoint (https://…)
                </span>
                <input
                  type="url"
                  inputMode="url"
                  value={byoEndpoint}
                  onChange={(e) => setByoEndpoint(e.target.value)}
                  disabled={isBinding}
                  placeholder="https://your-mcp-server.com/mcp"
                  aria-invalid={byoEndpoint.trim().length > 0 && !byoValid}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
                />
                {byoEndpoint.trim().length > 0 && !byoValid && (
                  <p className="text-xs text-rose-600">
                    Enter a full https:// URL.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">API key</span>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isBinding}
                placeholder="Paste the connector's API key"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
              />
              <p className="text-[11px] text-muted-foreground">
                Stored encrypted. We never show it again after you connect.
              </p>
            </div>

            {bindError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {bindError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={connect}
                disabled={!canConnect}
                className="crm-button-primary inline-flex h-9 items-center gap-1.5 px-4 text-sm"
              >
                <Plug className={`size-4 ${isBinding ? "animate-pulse" : ""}`} />
                {isBinding ? "Connecting…" : "Connect"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setApiKey("");
                  setByoEndpoint("");
                  setBindError(null);
                }}
                disabled={isBinding}
                className="crm-button-secondary h-9 px-4 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Connect-the-tools CTA (P2.1-T3) ─────────────────────────────────────────
//
// A generated agent BINDS external tools (Postiz to post, Google Calendar to
// book) onto its blueprint before the workspace has CONNECTED those accounts. The
// runtime's money-safe gate then refuses to fire an unconnected tool — so this
// banner asks the server (connectedToolsAction → the SAME predicate the runtime
// uses) which bound tools aren't connected yet, and shows a calm, on-brand
// "Connect <tool> in Integrations →" row for each. A social agent reads "Connect
// Postiz to go live." When every bound tool is connected, the banner renders
// nothing. Fetches on mount + whenever the bound set changes (bindingKey).
function ConnectToolsBanner({
  templateId,
  bindingKey,
}: {
  templateId: string;
  /** A fingerprint of the bound connector ids — re-runs the fetch on a change. */
  bindingKey: string;
}) {
  const [tools, setTools] = useState<ToolConnectionStatus[] | null>(null);

  useEffect(() => {
    let alive = true;
    // No bindings → nothing to check (skip the round-trip).
    if (!bindingKey) {
      setTools([]);
      return;
    }
    void connectedToolsAction({ templateId }).then((res) => {
      if (!alive) return;
      setTools(res.ok ? res.tools : []);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, bindingKey]);

  const unconnected = (tools ?? []).filter((t) => !t.connected);
  if (unconnected.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center text-amber-600 dark:text-amber-400"
        >
          <AlertCircle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {unconnected.length === 1
              ? "Connect this app to go live"
              : "Connect these apps to go live"}
          </p>
          <p className="mt-0.5 text-xs text-amber-700/90 dark:text-amber-400/80">
            This agent uses{" "}
            {unconnected.length === 1 ? "an app that isn't" : "apps that aren't"}{" "}
            connected yet. Until then it won&apos;t be able to use{" "}
            {unconnected.length === 1 ? "it" : "them"}.
          </p>
          <ul className="mt-2 space-y-1.5">
            {unconnected.map((t) => (
              <li key={t.key}>
                <Link
                  href="/integrations"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-background px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-500/10 dark:text-amber-300"
                >
                  Connect {t.label} in Integrations
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Apps & tools (per-agent app picker) ─────────────────────────────────────
//
// The quick-chips render from the SAME catalog the agent generator authors from
// (toolCatalogForUi() → TOOL_CATALOG), so what this UI offers is exactly what an
// agent can be wired to — one source of truth. Two chip behaviors, by the entry's
// wired kind:
//   • a managed-app entry (connectorKind "composio") toggles its toolkit slug,
//     persisting ONE kind:"composio" binding on the template blueprint
//     (enabledToolkits + a curated default tool allowlist); deselecting all
//     removes it. The accounts themselves are connected once, workspace-wide, in
//     Integrations (/integrations) — this only declares WHICH connected apps THIS
//     agent may use.
//   • a vetted entry (e.g. Postiz) needs an API key, so its chip OPENS the
//     add-connector flow pre-selected rather than silently toggling.
// Optimistic toggle; router.refresh() reconciles with the server.
function ComposioAppsSection({
  templateId,
  initialEnabled,
  onChanged,
  disabled = false,
  postizBound = false,
  onAddPostiz,
}: {
  templateId: string;
  initialEnabled: string[];
  onChanged: () => void;
  /** Voice templates can't run connectors — render the picker greyed + inert. */
  disabled?: boolean;
  /** Is the vetted Postiz connector already bound on this template? Drives the
   *  Postiz chip's on/off state. */
  postizBound?: boolean;
  /** Open the add-connector flow pre-selected to Postiz (Postiz is a vetted
   *  connector — it needs an API key, so it can't be silently toggled like a
   *  managed app). No-op when Postiz is already bound. */
  onAddPostiz?: () => void;
}) {
  // The one curated source: the same catalog the generator's author menu uses.
  // Computed once (pure, module-level data) — no need to memoize.
  const catalog = toolCatalogForUi();
  const [enabled, setEnabled] = useState<string[]>(initialEnabled);
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed when the server re-supplies props (after a refresh).
  useEffect(() => {
    setEnabled(initialEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEnabled.join(",")]);

  // Flash a transient "Saved ✓" for ~2s after a successful toggle persists.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const toggle = (slug: string) => {
    if (disabled) return;
    const next = enabled.includes(slug)
      ? enabled.filter((s) => s !== slug)
      : [...enabled, slug];
    setEnabled(next);
    setError(null);
    startBusy(async () => {
      const result = await setTemplateComposioToolkitsAction({
        templateId,
        toolkits: next,
      });
      if (!result.ok) {
        setEnabled(enabled); // revert
        setError(
          result.error === "unauthorized"
            ? "You don't have access to this template."
            : "Couldn't update apps.",
        );
        return;
      }
      setSaved(true);
      onChanged();
    });
  };

  return (
    <div className={`mt-4 rounded-lg border bg-background p-4 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
        >
          <Plug className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Apps &amp; tools
            {disabled && (
              <span className="text-[11px] font-normal text-muted-foreground">
                (not used on voice)
              </span>
            )}
            {saved && !disabled && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="size-3" aria-hidden /> Saved
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pick what this agent can do — connect the accounts once in{" "}
            <Link
              href="/integrations"
              className="font-medium underline underline-offset-2 hover:opacity-80"
            >
              Integrations &rarr;
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* One chip per catalog entry — the SAME catalog the generator authors
            from (toolCatalogForUi), so the UI offers exactly what an agent can be
            wired to. Two behaviors by wired kind:
              • composio → toggle the entry's toolkit slug (managed app)
              • vetted (Postiz) → open the add-connector flow pre-selected (it
                needs an API key, so it can't be silently toggled). */}
        {catalog.map((entry) => {
          const isVetted = entry.connectorKind === "vetted";
          // Postiz (the only vetted entry today) keys its chip on `postizBound`;
          // a managed app keys on whether its toolkit slug is enabled.
          const on = isVetted
            ? postizBound
            : !!entry.toolkitSlug && enabled.includes(entry.toolkitSlug);
          return (
            <AppToolChip
              key={entry.id}
              label={appChipLabel(entry)}
              on={on}
              disabled={busy || disabled || (isVetted && postizBound)}
              onClick={() => {
                if (disabled) return;
                if (isVetted) {
                  if (!postizBound) onAddPostiz?.();
                } else if (entry.toolkitSlug) {
                  toggle(entry.toolkitSlug);
                }
              }}
            />
          );
        })}
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}

/** The operator-facing chip label for a catalog entry. Postiz (vetted, social)
 *  reads as a verb-first action ("Post to social (Postiz)") since its chip kicks
 *  off a connect flow; every managed app uses its catalog label as-is. Keyed on
 *  the stable catalog id, not a user-visible string. */
function appChipLabel(entry: ToolCatalogUiEntry): string {
  if (entry.id === "postiz") return "Post to social (Postiz)";
  return entry.label;
}

/** A single "Apps & tools" pill. One presentation for both behaviors (toggle a
 *  managed app / open the Postiz connect flow); the caller decides what onClick
 *  does and what `on` means. */
function AppToolChip({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
        on
          ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
          : "bg-background text-muted-foreground hover:bg-muted/50"
      }`}
    >
      {on ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Plus className="size-3.5" aria-hidden />
      )}
      {label}
    </button>
  );
}

/** One bound connector: label + tool-count badge, expandable per-tool enable
 *  checkboxes (setTemplateConnectorToolsAction), Refresh + Remove. Optimistic on
 *  the toggle; router.refresh() reconciles with the server. */
function ConnectorRow({
  templateId,
  binding,
  onChanged,
}: {
  templateId: string;
  binding: ConnectorBinding;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, startBusy] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);
  // Optimistic enabled set so the checkboxes feel instant; seeded from props.
  const [enabled, setEnabled] = useState<string[]>(binding.enabledTools);

  const tools = binding.tools ?? [];
  const label =
    binding.kind === "vetted"
      ? binding.id === "postiz"
        ? "Postiz"
        : binding.id
      : binding.kind === "composio"
        ? `Apps: ${binding.enabledToolkits.join(", ") || "apps"}`
        : `Custom: ${hostOf(binding.endpoint)}`;

  const toggleTool = (name: string) => {
    const next = enabled.includes(name)
      ? enabled.filter((n) => n !== name)
      : [...enabled, name];
    setEnabled(next);
    setRowError(null);
    startBusy(async () => {
      const result = await setTemplateConnectorToolsAction({
        templateId,
        connectorId: binding.id,
        enabledTools: next,
      });
      if (!result.ok) {
        setEnabled(binding.enabledTools); // revert
        setRowError("Couldn't update tools.");
        return;
      }
      onChanged();
    });
  };

  const refresh = () => {
    setRowError(null);
    startBusy(async () => {
      const result = await refreshTemplateConnectorAction({
        templateId,
        connectorId: binding.id,
      });
      if (!result.ok) {
        setRowError("Couldn't refresh tools.");
        return;
      }
      onChanged();
    });
  };

  const remove = () => {
    setRowError(null);
    startBusy(async () => {
      const result = await unbindTemplateConnectorAction({
        templateId,
        connectorId: binding.id,
      });
      if (!result.ok) {
        setRowError("Couldn't remove connector.");
        return;
      }
      onChanged();
    });
  };

  return (
    <li className="rounded-lg border bg-background">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {enabled.length}/{tools.length} tools
          </span>
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          title="Re-discover tools"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden />
          <span className="sr-only">Refresh</span>
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          title="Remove connector"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-50"
        >
          <Trash2 className="size-4" aria-hidden />
          <span className="sr-only">Remove</span>
        </button>
      </div>

      {rowError && (
        <p className="px-3 pb-2 text-xs text-rose-600 dark:text-rose-400">
          {rowError}
        </p>
      )}

      {expanded && (
        <div className="border-t px-3 py-3">
          {tools.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No tools discovered. Use Refresh to re-discover from the server.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {tools.map((t) => (
                <label
                  key={t.name}
                  className="flex cursor-pointer items-start gap-2 rounded-md border bg-card p-2.5 text-sm hover:bg-muted/40"
                  title={t.description}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={enabled.includes(t.name)}
                    disabled={busy}
                    onChange={() => toggleTool(t.name)}
                  />
                  <code className="min-w-0 break-all font-mono text-xs">
                    {t.name}
                  </code>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Map a bind action error code to friendly copy. */
function friendlyBindError(error: string): string {
  if (error === "api_key_required") return "Enter the connector's API key.";
  if (error === "unauthorized") return "You don't have access to this template.";
  if (error === "template_not_found") return "Template not found.";
  if (/https/i.test(error)) return "The MCP endpoint must use https://.";
  // Discovery / network failures surface the server message (no secret in it).
  return `Couldn't connect: ${error}`;
}

/** Derive a stable, filesystem-safe id from a BYO endpoint (host + path slug). */
function slugForByo(endpoint: string): string {
  try {
    const u = new URL(endpoint.trim());
    const raw = `${u.host}${u.pathname}`.toLowerCase();
    const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    return slug || "custom-mcp";
  } catch {
    return "custom-mcp";
  }
}

/** Host portion of a URL for the "Custom: host" label (falls back to the raw). */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}
