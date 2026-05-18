"use client";

// 2026-05-18 — Outbound triggers editor (messaging plan v2, slice 5).
//
// One-card-per-trigger surface on /emails. Each card surfaces:
//   - Enabled toggle (immediate save via setOutboundTriggerEnabledAction)
//   - Event + channel + skill label
//   - Edit skill button → expands the card into an inline SKILL.md
//     textarea pre-filled with the operator's current copy OR the
//     platform default if they haven't customized. Same "Platform
//     default / Customized / Reset to default" chip pattern as the
//     Phase 6 agent-blueprint editor.
//
// The textarea is intentionally inline (not a drawer) so the operator
// can compare email and SMS triggers side-by-side without modal-
// hopping. Drawer felt heavier than the editing task warrants.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageSquare } from "lucide-react";
import {
  saveOutboundTriggerSkillAction,
  setOutboundTriggerEnabledAction,
  type TriggerRowView,
} from "@/lib/messaging/actions";

const CUSTOM_SKILL_MD_MAX = 8000;

export function OutboundTriggersSection({
  triggers,
}: {
  triggers: TriggerRowView[];
}) {
  if (triggers.length === 0) {
    return (
      <article className="rounded-xl border bg-card p-5 space-y-2">
        <h3 className="text-base font-medium text-foreground">
          Transactional triggers
        </h3>
        <p className="text-sm text-muted-foreground">
          No triggers configured yet. The default booking-confirmation
          triggers seed when a workspace is created — if you don't see
          any here, contact support.
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-xl border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-base font-medium text-foreground">
          Transactional triggers
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Each customer-facing message is composed by your AI from a
          skill prompt — edit the prompt to tune voice, length, or
          rules. Hard safety checks (no fake prices, length caps) are
          enforced automatically regardless of what you write.
        </p>
      </div>

      <div className="space-y-3">
        {triggers.map((trigger) => (
          <TriggerCard key={trigger.id} trigger={trigger} />
        ))}
      </div>
    </article>
  );
}

function TriggerCard({ trigger }: { trigger: TriggerRowView }) {
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(trigger.enabled);
  const initialDraft = trigger.hasCustomSkillMd
    ? trigger.customSkillMd
    : trigger.platformDefaultMd;
  const [draft, setDraft] = useState(initialDraft);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isUnchangedFromDefault =
    draft.trim() === trigger.platformDefaultMd.trim();

  const channelIcon =
    trigger.channel === "email" ? (
      <Mail className="size-3.5" aria-hidden />
    ) : (
      <MessageSquare className="size-3.5" aria-hidden />
    );

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await setOutboundTriggerEnabledAction({
        triggerId: trigger.id,
        enabled: next,
      });
      if (!result.ok) {
        // Revert on failure.
        setEnabled(!next);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleSave() {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await saveOutboundTriggerSkillAction({
        triggerId: trigger.id,
        customSkillMd: draft,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setSavedAt(Date.now());
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${
                trigger.channel === "email"
                  ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              }`}
            >
              {channelIcon}
              {trigger.channel}
            </span>
            <span className="text-sm font-medium text-foreground">
              {trigger.skillLabel}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${
                trigger.hasCustomSkillMd
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {trigger.hasCustomSkillMd ? "Customized" : "Platform default"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Fires on{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
              {trigger.eventType}
            </code>
            {trigger.delayMinutes > 0 ? (
              <>
                {" · "}
                {trigger.delayMinutes >= 60
                  ? `${Math.round(trigger.delayMinutes / 60)}h delay`
                  : `${trigger.delayMinutes}m delay`}
              </>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <span>{enabled ? "Enabled" : "Disabled"}</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={handleToggle}
              disabled={isPending}
              className="size-4"
            />
          </label>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="crm-button-ghost h-8 px-3 text-xs"
          >
            {expanded ? "Close" : "Edit skill"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Skill prose — markdown with {"{{placeholder}}"} slots. Available
              vars: {"{{businessName}}, {{contactFirstName}}, {{bookingTitle}}, {{bookingStartsAtLocal}}, {{bookingPageUrl}}, {{businessPhone}}, {{voice}}"}
            </p>
            <span
              className={`font-mono text-[10px] ${
                draft.length > CUSTOM_SKILL_MD_MAX
                  ? "text-rose-600"
                  : "text-muted-foreground"
              }`}
            >
              {draft.length.toLocaleString()} / {CUSTOM_SKILL_MD_MAX.toLocaleString()}
            </span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            maxLength={CUSTOM_SKILL_MD_MAX + 256}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed focus:border-primary focus:outline-none"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Compose validators (forbidden strings, length caps, channel
              constraints) always run after this skill — you can&apos;t bypass
              them by editing here.
            </p>
            <div className="flex items-center gap-2">
              {savedAt ? (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  ✓ Saved
                </span>
              ) : null}
              {error ? (
                <span className="text-[11px] text-rose-600">{error}</span>
              ) : null}
              <button
                type="button"
                onClick={() => setDraft(trigger.platformDefaultMd)}
                disabled={isUnchangedFromDefault || isPending}
                className="crm-button-ghost h-8 px-2.5 text-[11px] disabled:opacity-40"
              >
                Reset to default
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="crm-button-primary h-8 px-3 text-xs"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
