// Per-deployment agent customization — the agency editing surface (Task 5).
//
// A reusable, controlled editor for a deployment's DeploymentCustomization: the
// per-client persona OVERRIDES a deployed agent uses — the spoken/written
// greeting, the TTS voice, and the business-info facts that fill the template's
// `{placeholders}` (and ground the agent). The agency tunes these per-client
// from the Studio client card (activate-form.tsx renders it inside a collapsible
// "Agent customization" section, NEXT TO "Booking rules").
//
// "use client" — owns the controlled field state + the save transition. Seeded
// from the deployment's stored `customization` (passed as `initial`), so the
// operator edits the values actually in force. Each field is OPTIONAL: a blank
// greeting / blank voice / blank business field means "use the template's
// default" (the persona resolver tolerates blanks + drops unfilled
// placeholders). On Save it assembles a sparse customization from local state —
// trimming blanks so a cleared field persists as absent rather than "" — and
// persists it via setDeploymentCustomizationAction.
//
// House chrome mirrors booking-policy-editor.tsx: crm-button-* / crm-input
// classes, the muted label/border styles, useTransition, and the transient
// "Saved ✓" flash. NO new deps.

"use client";

import { useState, useTransition, useEffect } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { setDeploymentCustomizationAction } from "@/lib/deployments/actions";
import { VOICE_OPTIONS } from "@/lib/agents/voice/card-status";
import type { DeploymentCustomization } from "@/lib/agents/persona/deployment-customization";

type DeploymentCustomizationEditorProps = {
  deploymentId: string;
  /** The deployment's stored customization (sparse Partial) — null = no override
   *  yet (→ the template's defaults). Seeds the controlled fields. */
  initial: Partial<DeploymentCustomization> | null;
  /** Fired after a successful save (e.g. so the parent can refresh / close). */
  onSaved?: () => void;
};

export function DeploymentCustomizationEditor({
  deploymentId,
  initial,
  onSaved,
}: DeploymentCustomizationEditorProps) {
  // Every field is a controlled string. An empty string = "use the template's
  // default"; we trim → drop blanks on save so a cleared field persists absent.
  const info = initial?.businessInfo;
  const [greeting, setGreeting] = useState(initial?.greeting ?? "");
  const [voiceId, setVoiceId] = useState(initial?.voiceId ?? "");
  const [name, setName] = useState(info?.name ?? "");
  const [hours, setHours] = useState(info?.hours ?? "");
  const [address, setAddress] = useState(info?.address ?? "");
  const [phone, setPhone] = useState(info?.phone ?? "");
  const [email, setEmail] = useState(info?.email ?? "");

  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Flash a transient "Saved ✓" for ~2s after a successful save.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const save = () => {
    setError(null);
    setSaved(false);
    if (isSaving) return;

    // Assemble a SPARSE customization from controlled state: trim every field
    // and include it only when non-empty, so a cleared field persists as absent
    // (→ the template's default) rather than an empty string. An all-blank
    // businessInfo is omitted entirely; an all-blank form persists as null
    // (clears the override).
    const businessInfo: NonNullable<DeploymentCustomization["businessInfo"]> = {};
    const addInfo = (key: keyof typeof businessInfo, value: string) => {
      const v = value.trim();
      if (v) businessInfo[key] = v;
    };
    addInfo("name", name);
    addInfo("hours", hours);
    addInfo("address", address);
    addInfo("phone", phone);
    addInfo("email", email);

    const customization: Partial<DeploymentCustomization> = {};
    const greetingTrimmed = greeting.trim();
    const voiceTrimmed = voiceId.trim();
    if (greetingTrimmed) customization.greeting = greetingTrimmed;
    if (voiceTrimmed) customization.voiceId = voiceTrimmed;
    if (Object.keys(businessInfo).length > 0) customization.businessInfo = businessInfo;

    // Nothing set → persist null (clear the override) rather than an empty {}.
    const payload =
      Object.keys(customization).length > 0 ? customization : null;

    startSave(async () => {
      const result = await setDeploymentCustomizationAction({
        deploymentId,
        customization: payload,
      });
      if (result.ok) {
        setSaved(true);
        onSaved?.();
      } else {
        setError(
          result.error === "unauthorized"
            ? "You don't have access to this client."
            : result.error === "not_found"
              ? "Client not found."
              : "Couldn't save the customization — try again.",
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Greeting — full override of the spoken/written greeting */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Greeting
        </span>
        <textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          disabled={isSaving}
          rows={2}
          placeholder="Thanks for calling {business_name}!"
          className="crm-input min-h-[3.5rem] w-full text-sm disabled:opacity-50"
        />
        <span className="text-[11px] text-muted-foreground">
          Leave blank to use the template&apos;s default.{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
            {"{business_name}"}
          </code>{" "}
          auto-fills from the business name below.
        </span>
      </label>

      {/* Voice — a select of the available TTS voices (first = template default) */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Voice
        </span>
        <select
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          disabled={isSaving}
          className="crm-input h-9 w-full max-w-xs text-sm capitalize disabled:opacity-50"
        >
          <option value="">Use template default</option>
          {VOICE_OPTIONS.map((v) => (
            <option key={v} value={v} className="capitalize">
              {v}
            </option>
          ))}
        </select>
      </label>

      {/* Business info — fills the template's {placeholders} + grounds the agent */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Business info
        </span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="Name" value={name} onChange={setName} disabled={isSaving} placeholder="Acme Plumbing" />
          <TextField label="Hours" value={hours} onChange={setHours} disabled={isSaving} placeholder="Mon–Fri 9–5" />
          <TextField label="Address" value={address} onChange={setAddress} disabled={isSaving} placeholder="123 Main St" />
          <TextField label="Phone" value={phone} onChange={setPhone} disabled={isSaving} placeholder="+1 555 123 4567" />
          <TextField label="Email" value={email} onChange={setEmail} disabled={isSaving} placeholder="hello@acme.com" />
        </div>
      </div>

      {/* Save */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="crm-button-primary inline-flex h-9 items-center gap-1.5 px-4 text-sm disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" />
              Save customization
            </>
          )}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="size-3.5" aria-hidden /> Saved
          </span>
        )}
        {error && (
          <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>
        )}
      </div>
    </div>
  );
}

/** One compact labeled text input — the business-info cells. */
function TextField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="crm-input h-8 w-full text-sm disabled:opacity-50"
      />
    </label>
  );
}
