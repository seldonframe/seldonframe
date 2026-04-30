"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  saveAgentConfigAction,
  setAgentDeployStateAction,
  type AgentConfig,
} from "@/lib/agents/configure-actions";

/**
 * WS3 — agent configure form.
 *
 * Two columns on wide screens (60/40 split): config form on the left,
 * live preview on the right. Stack vertically below `lg`.
 *
 * Form generation is metadata-driven: each placeholder from the
 * archetype renders one field. Placeholders with `valuesFromTool` get
 * a typed select populated from the parent server component; others
 * fall back to a text input. Soul-copy placeholders ("$opening_message"
 * etc.) are hidden — those get filled by Claude during synthesis.
 *
 * Preview panel summarizes the resolved pipeline (trigger → step →
 * step → done) so operators understand what they're deploying before
 * they click. The summary is derived from `specTemplate.steps` —
 * generic enough to handle every archetype shape without bespoke
 * per-archetype code.
 */

export type PlaceholderField = {
  key: string; // e.g. "$formId"
  kind: "user_input" | "soul_copy";
  description: string;
  example: string | null;
  valuesFromTool: string | null;
};

export type PickerOption = { id: string; label: string };

export type ConfigureAgentFormProps = {
  archetypeId: string;
  archetypeName: string;
  placeholders: PlaceholderField[];
  requiresInstalled: string[];
  savedConfig: AgentConfig | null;
  formOptions: PickerOption[];
  appointmentOptions: PickerOption[];
  specTemplate: Record<string, unknown>;
};

const MODEL_OPTIONS = [
  { value: "claude-sonnet-4", label: "Claude Sonnet 4 — recommended" },
  { value: "claude-opus-4", label: "Claude Opus 4 — highest quality" },
  { value: "claude-haiku-4", label: "Claude Haiku 4 — fastest, cheapest" },
];

/**
 * Operator-friendly label for a `$placeholder` key. Maps the dev-style
 * camelCase id to plain English so the form reads like a question
 * ("Which form should trigger this?") instead of a developer console
 * ("formId").
 *
 * Falls back to a humanized version of the key for placeholders we
 * haven't explicitly named yet.
 */
const PLACEHOLDER_LABELS: Record<string, string> = {
  $formId: "Trigger form",
  $appointmentTypeId: "Booking type",
  $appointmentTypeSlug: "Booking type",
  $reviewUrl: "Review link",
  $emailRecipient: "Send digest to",
  $cron: "When to run",
  $couponDiscountPercent: "Discount %",
  $smsKeyword: "SMS keyword to listen for",
  $bookingSlug: "Booking type",
  $weatherProvider: "Weather provider",
};

function placeholderLabel(key: string): string {
  if (PLACEHOLDER_LABELS[key]) return PLACEHOLDER_LABELS[key];
  // Fallback: strip leading $, split camelCase, capitalize first.
  const base = key.replace(/^\$/, "");
  const spaced = base.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Plain-English step descriptors for the pipeline preview. The keys
 * are step IDs (when the archetype assigns them) or step types
 * (when no id is set). Kept short so the right-rail preview reads as
 * a flow rather than a developer log.
 */
const STEP_LABEL_BY_ID: Record<string, string> = {
  // speed-to-lead
  initial_wait: "Wait a couple of minutes",
  qualify_conversation: "Text the lead",
  book_consultation: "Book the consultation",
  send_confirmation: "Send confirmation",
  log_activity: "Log activity",
  // win-back
  send_winback_email: "Send win-back email",
  wait_for_sms_reminder: "Wait, then nudge by SMS",
  send_winback_sms: "Send win-back SMS",
  create_coupon_step: "Create unique coupon",
  // review-requester
  send_review_email: "Send review email",
  wait_for_review_reply: "Wait for response",
  send_review_sms_nudge: "Send SMS nudge",
  // daily-digest
  build_digest: "Compile digest",
  send_digest_email: "Email the digest",
  // weather-aware-booking
  fetch_forecast: "Check weather forecast",
  branch_on_rain: "Branch on rain risk",
  offer_reschedule: "Offer reschedule",
  confirm_booking: "Confirm booking",
  // appointment-confirm-sms
  lookup_appointment: "Look up appointment",
  reply_with_confirmation: "Reply with confirmation",
};

export function ConfigureAgentForm({
  archetypeId,
  archetypeName,
  placeholders,
  requiresInstalled,
  savedConfig,
  formOptions,
  appointmentOptions,
  specTemplate,
}: ConfigureAgentFormProps) {
  const userInputPlaceholders = placeholders.filter((p) => p.kind === "user_input");
  const initial = savedConfig ?? {
    placeholders: {},
    temperature: 0.7,
    model: "claude-sonnet-4",
    approvalRequired: true,
    maxRunsPerDay: 50,
    deployedAt: null,
    pausedAt: null,
    systemPromptOverride: null,
  };

  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>(
    () => ({ ...initial.placeholders })
  );
  const [model, setModel] = useState(initial.model || "claude-sonnet-4");
  const [temperature, setTemperature] = useState(initial.temperature ?? 0.7);
  const [approvalRequired, setApprovalRequired] = useState(initial.approvalRequired ?? true);
  const [maxRunsPerDay, setMaxRunsPerDay] = useState(initial.maxRunsPerDay ?? 50);
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPromptOverride ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<"saved" | "deployed" | "paused" | null>(null);
  const [, startTransition] = useTransition();

  function setPlaceholder(key: string, value: string) {
    setPlaceholderValues((current) => ({ ...current, [key]: value }));
  }

  async function persistConfig(): Promise<{ ok: boolean }> {
    const result = await saveAgentConfigAction({
      archetypeId,
      placeholders: placeholderValues,
      temperature,
      model,
      approvalRequired,
      maxRunsPerDay,
      systemPromptOverride: systemPrompt.trim() || null,
    });
    if (!result.ok) {
      setError(result.error);
      return { ok: false };
    }
    return { ok: true };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    try {
      const { ok } = await persistConfig();
      if (ok) {
        setSavedFlash("saved");
        setTimeout(() => setSavedFlash(null), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  // Save & Deploy: one button that persists config, then flips the
  // deploy state in the same user action. Operator-friendly path —
  // config-without-deploy is rare in the wild so we collapse it.
  async function handleSaveAndDeploy() {
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    try {
      const { ok } = await persistConfig();
      if (!ok) return;
      const deployResult = await setAgentDeployStateAction({
        archetypeId,
        state: "deployed",
      });
      if (!deployResult.ok) {
        setError(deployResult.error);
        return;
      }
      setSavedFlash("deployed");
      setTimeout(() => setSavedFlash(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  function handleDeployToggle(state: "deployed" | "paused") {
    startTransition(async () => {
      const result = await setAgentDeployStateAction({ archetypeId, state });
      if (!result.ok) setError(result.error);
      else {
        setSavedFlash(state === "paused" ? "paused" : "deployed");
        setTimeout(() => setSavedFlash(null), 2500);
      }
    });
  }

  const isDeployed = Boolean(savedConfig?.deployedAt && !savedConfig?.pausedAt);
  const isPaused = Boolean(savedConfig?.pausedAt);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* ─── LEFT: form ─── */}
      <form onSubmit={handleSave} className="space-y-5">
        {requiresInstalled.length > 0 ? (
          <div className="rounded-xl border bg-card p-4 text-xs">
            <p className="font-medium text-foreground">Required blocks</p>
            <p className="mt-1 text-muted-foreground">
              This agent depends on:{" "}
              {requiresInstalled.map((slug, i) => (
                <span key={slug}>
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                    {slug}
                  </code>
                  {i < requiresInstalled.length - 1 ? " · " : ""}
                </span>
              ))}
              . If any are missing, deploys will fail. Install them via{" "}
              <Link href="/soul-marketplace" className="underline hover:text-foreground">
                Soul Marketplace
              </Link>
              .
            </p>
          </div>
        ) : null}

        {/* Placeholders */}
        {userInputPlaceholders.length > 0 ? (
          <fieldset className="rounded-xl border bg-card p-5 space-y-4">
            <legend className="-ml-1 px-1 text-sm font-semibold text-foreground">
              Configuration
            </legend>
            {userInputPlaceholders.map((p) => (
              <PlaceholderInput
                key={p.key}
                field={p}
                value={placeholderValues[p.key] ?? ""}
                onChange={(v) => setPlaceholder(p.key, v)}
                formOptions={formOptions}
                appointmentOptions={appointmentOptions}
              />
            ))}
          </fieldset>
        ) : null}

        {/* Model + temperature */}
        <fieldset className="rounded-xl border bg-card p-5 space-y-4">
          <legend className="-ml-1 px-1 text-sm font-semibold text-foreground">
            LLM
          </legend>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="crm-input h-9 w-full"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Uses your{" "}
              <Link href="/settings/integrations" className="underline hover:text-foreground">
                Anthropic API key
              </Link>{" "}
              — runs are billed directly to Anthropic.
            </p>
          </div>
          <div>
            <label className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-1.5">
              <span>Temperature</span>
              <span className="tabular-nums text-foreground">{temperature.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              0.0 = deterministic / cheap. 0.7 = sweet spot for conversational agents.
              1.0 = creative but unpredictable.
            </p>
          </div>
        </fieldset>

        {/* Safety */}
        <fieldset className="rounded-xl border bg-card p-5 space-y-4">
          <legend className="-ml-1 px-1 text-sm font-semibold text-foreground">
            Safety &amp; rate limits
          </legend>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={approvalRequired}
              onChange={(e) => setApprovalRequired(e.target.checked)}
              className="mt-1 size-4 rounded border-border"
            />
            <div className="flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <ShieldCheck className="size-3.5 text-primary" />
                Require approval before sending
              </span>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Outputs are held for your review before SMS / email / booking actions
                fire. Recommended for new agents until you trust the behavior.
              </p>
            </div>
          </label>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Max runs per day
            </label>
            <input
              type="number"
              min={1}
              max={10000}
              value={maxRunsPerDay}
              onChange={(e) => setMaxRunsPerDay(Number(e.target.value) || 50)}
              className="crm-input h-9 w-32"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Hard cap to prevent runaway loops. Excess triggers are dropped (logged
              for review).
            </p>
          </div>
        </fieldset>

        {/* Optional system-prompt override */}
        <details className="rounded-xl border bg-card p-5">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                Advanced — system prompt override
              </span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. Replaces Claude&apos;s system prompt for this archetype.
              Synthesis defaults are tuned per-archetype — only override if you know
              what you&apos;re doing.
            </p>
          </summary>
          <textarea
            rows={6}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Leave blank to use the archetype default."
            className="crm-input mt-3 w-full font-mono text-xs"
          />
        </details>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Primary CTA: Save & deploy in one click. The approval
              gate (default ON) is the safety net so this is safe to
              fast-path. */}
          {!isDeployed ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveAndDeploy}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white shadow-(--shadow-xs) transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              <Play className="size-3.5" />
              {saving
                ? "Deploying…"
                : isPaused
                  ? "Resume agent"
                  : "Save & deploy agent"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleDeployToggle("paused")}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm hover:bg-muted/50"
            >
              <Pause className="size-3.5" />
              Pause agent
            </button>
          )}

          {/* Secondary: save only (no deploy). Useful for refining
              copy / temperature without re-arming triggers. */}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm text-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save only"}
          </button>

          {savedFlash ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              {savedFlash === "deployed"
                ? "Saved & deployed"
                : savedFlash === "paused"
                  ? "Paused"
                  : "Saved"}
            </span>
          ) : null}

          <Link
            href={`/automations/${archetypeId}/runs`}
            className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            See runs →
          </Link>
        </div>

        {savedConfig ? (
          <p className="text-[11px] text-muted-foreground">
            {isDeployed
              ? `Live — listening for ${archetypeName.toLowerCase()} triggers. Outputs hold for your approval before sending.`
              : isPaused
                ? "Paused — triggers will be ignored until you resume."
                : "Saved. Click Save & deploy to start listening for triggers."}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Approval gate defaults to ON — every outbound action waits for your sign-off
            before sending. Safe to deploy on the first click.
          </p>
        )}
      </form>

      {/* ─── RIGHT: live preview ─── */}
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 pb-3 border-b">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Pipeline preview</h2>
          </div>
          <PipelinePreview
            specTemplate={specTemplate}
            placeholderValues={placeholderValues}
            approvalRequired={approvalRequired}
            model={model}
          />
        </div>

        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 text-foreground mb-1.5">
            <Bot className="size-3.5" />
            <span className="font-medium">What &quot;deploy&quot; does</span>
          </div>
          <p>
            Saving stores your configuration. Deploying registers the agent against the
            workflow runtime — from then on, matching triggers (form submissions,
            bookings, schedules, SMS replies) start a workflow run that the engine
            executes durably with retries and approval gates.
          </p>
        </div>
      </aside>
    </div>
  );
}

/* ─── placeholder input ─── */

function PlaceholderInput({
  field,
  value,
  onChange,
  formOptions,
  appointmentOptions,
}: {
  field: PlaceholderField;
  value: string;
  onChange: (next: string) => void;
  formOptions: PickerOption[];
  appointmentOptions: PickerOption[];
}) {
  const label = placeholderLabel(field.key);
  const id = `pf-${field.key.replace(/[^a-z0-9]/gi, "-")}`;

  // valuesFromTool drives the picker source. Three known tools today;
  // others fall back to text input until their lister is wired up.
  let pickerOptions: PickerOption[] | null = null;
  if (field.valuesFromTool === "list_forms") pickerOptions = formOptions;
  else if (field.valuesFromTool === "list_appointment_types") pickerOptions = appointmentOptions;

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-foreground mb-1.5">
        {label}
      </label>
      {pickerOptions ? (
        <select
          id={id}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="crm-input h-9 w-full"
        >
          <option value="">Pick one…</option>
          {pickerOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="text"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.example ?? ""}
          className="crm-input h-9 w-full"
        />
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">{field.description}</p>
    </div>
  );
}

/* ─── pipeline preview ─── */

type SpecStep = {
  id?: string;
  type?: string;
  next?: string | string[];
  tool?: string;
  capture?: string;
  [key: string]: unknown;
};

function PipelinePreview({
  specTemplate,
  placeholderValues,
  approvalRequired,
  model,
}: {
  specTemplate: Record<string, unknown>;
  placeholderValues: Record<string, string>;
  approvalRequired: boolean;
  model: string;
}) {
  const trigger = useMemo(() => {
    const t = (specTemplate.trigger ?? {}) as Record<string, unknown>;
    const type = (t.type as string) ?? "event";
    const event = (t.event as string) ?? null;
    const cron = (t.cron as string) ?? null;
    return { type, event, cron };
  }, [specTemplate]);

  const steps = useMemo(() => {
    const raw = specTemplate.steps;
    if (!Array.isArray(raw)) return [] as SpecStep[];
    return raw as SpecStep[];
  }, [specTemplate]);

  function describeStep(step: SpecStep): string {
    // Prefer the archetype-aware plain-English label keyed by step
    // id. Falls back to step-type heuristics for steps the lookup
    // table doesn't know about (and for any new archetypes we add
    // before the table catches up).
    if (step.id && STEP_LABEL_BY_ID[step.id]) return STEP_LABEL_BY_ID[step.id];

    if (step.type === "wait_for_duration") {
      const seconds = step.duration_seconds as number | undefined;
      if (typeof seconds === "number") {
        if (seconds % 86400 === 0) return `Wait ${seconds / 86400} day${seconds / 86400 === 1 ? "" : "s"}`;
        if (seconds % 3600 === 0) return `Wait ${seconds / 3600} hour${seconds / 3600 === 1 ? "" : "s"}`;
        if (seconds % 60 === 0) return `Wait ${seconds / 60} min`;
        return `Wait ${seconds}s`;
      }
      return "Wait";
    }
    if (step.type === "mcp_tool_call") return `Run ${humanizeToolName(step.tool)}`;
    if (step.type === "send_sms") return "Send SMS";
    if (step.type === "send_email") return "Send email";
    if (step.type === "conversation") return "Have a conversation";
    if (step.type === "create_booking") return "Book the appointment";
    if (step.type === "create_activity") return "Log activity";
    if (step.type === "await_event") return `Wait for ${humanizeEventType(step.event_type as string | undefined)}`;
    if (step.type === "branch") return "Decide what to do next";
    return step.type ?? "Step";
  }

  function humanizeToolName(tool: unknown): string {
    if (typeof tool !== "string") return "tool";
    return tool
      .replace(/^create_/, "create ")
      .replace(/^update_/, "update ")
      .replace(/^send_/, "send ")
      .replace(/^list_/, "list ")
      .replace(/^get_/, "look up ")
      .replace(/_/g, " ");
  }
  function humanizeEventType(eventType: string | undefined): string {
    if (!eventType) return "event";
    return eventType
      .replace(/\./g, " ")
      .replace(/_/g, " ");
  }

  // Operator-friendly trigger labels mirror the catalog's archetype
  // descriptions: "When a form is submitted…" reads better than the
  // dotted event id `form.submitted`.
  const TRIGGER_LABELS: Record<string, string> = {
    "form.submitted": "When a form is submitted",
    "booking.created": "When a booking is created",
    "booking.completed": "When a booking is completed",
    "subscription.cancelled": "When a subscription is cancelled",
    "sms.received": "When an SMS is received",
    "deal.stage_changed": "When a deal moves stages",
  };
  const triggerLabel =
    trigger.type === "event" && trigger.event
      ? TRIGGER_LABELS[trigger.event] ?? `When ${trigger.event.replace(/\./g, " ").replace(/_/g, " ")}`
      : trigger.type === "cron" && trigger.cron
        ? `Every day on a schedule (${trigger.cron})`
        : trigger.type;

  const filledCount = Object.values(placeholderValues).filter(Boolean).length;
  const totalCount = Object.keys(placeholderValues).length;

  return (
    <div className="space-y-3 pt-3">
      <Flow
        kind="trigger"
        label={`Trigger: ${triggerLabel}`}
        sublabel={
          trigger.type === "event"
            ? "Workflow starts when this event fires for the workspace."
            : trigger.type === "cron"
              ? "Cron-scheduled — runs even with no human input."
              : null
        }
      />
      {steps.map((step, idx) => (
        <Flow
          key={`${step.id ?? idx}`}
          kind={step.type === "send_sms" || step.type === "send_email" || step.type === "create_booking" ? "action" : "step"}
          label={`${idx + 1}. ${describeStep(step)}`}
          sublabel={step.capture ? `Capture as {{${step.capture}}}` : null}
        />
      ))}
      {approvalRequired ? (
        <Flow
          kind="gate"
          label="Approval gate"
          sublabel="Each outbound action waits for your approval"
        />
      ) : null}
      <div className="border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        Powered by <code className="font-mono">{model}</code> ·{" "}
        {totalCount > 0 ? `${filledCount}/${totalCount} fields configured` : "no inputs required"}
      </div>
    </div>
  );
}

function Flow({
  kind,
  label,
  sublabel,
}: {
  kind: "trigger" | "step" | "action" | "gate";
  label: string;
  sublabel: string | null;
}) {
  const tone =
    kind === "trigger"
      ? "border-primary/40 bg-primary/5"
      : kind === "action"
        ? "border-emerald-500/30 bg-emerald-500/5"
        : kind === "gate"
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border bg-background/50";
  return (
    <div className={`flex items-start gap-2 rounded-lg border ${tone} p-2.5`}>
      <ChevronRight className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground truncate">{label}</p>
        {sublabel ? (
          <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>
        ) : null}
      </div>
    </div>
  );
}
