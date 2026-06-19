"use client";

// Stage C2 — the voice receptionist editor (client). Mirrors the website
// chatbot's settings-client.tsx: edits buffer client-side, "Save" sends the
// full patch to saveVoiceBlueprintAction (→ updateAgentBlueprint: bumps version
// + writes an agent_versions row). The Live/Pause control and the number
// assignment are separate one-shot actions (status + org integrations live
// outside the blueprint).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveVoiceBlueprintAction,
  setVoiceStatusAction,
  assignVoiceNumberAction,
} from "./actions";
import { VOICE_OPTIONS } from "@/lib/agents/voice/card-status";

type FaqRow = { q: string; a: string };
// voice R1 — a per-service price band edited as strings (the inputs hold text;
// we coerce low/high to numbers on save).
type QuoteRangeRow = { service: string; low: string; high: string };

type Props = {
  agentId: string;
  currentVersion: number;
  status: string;
  initialNumber: string;
  initialBlueprint: {
    greeting: string;
    voice: string;
    capabilities: string[];
    faq: FaqRow[];
    quoteRanges: { service: string; low: number; high: number }[];
    notifyPhone: string;
    missedCallTextBack: { enabled: boolean; message: string };
  };
  allCapabilities: string[];
};

export function VoiceReceptionistEditor(props: Props) {
  const router = useRouter();

  // ── blueprint buffer ──────────────────────────────────────────────────
  const [greeting, setGreeting] = useState(props.initialBlueprint.greeting);
  const [voice, setVoice] = useState(props.initialBlueprint.voice);
  const [capabilities, setCapabilities] = useState<string[]>(
    props.initialBlueprint.capabilities,
  );
  const [faq, setFaq] = useState<FaqRow[]>(props.initialBlueprint.faq);
  // voice R1 — quote ranges (stringified for the inputs) + team callback number.
  const [quoteRanges, setQuoteRanges] = useState<QuoteRangeRow[]>(
    props.initialBlueprint.quoteRanges.map((r) => ({
      service: r.service,
      low: String(r.low),
      high: String(r.high),
    })),
  );
  const [notifyPhone, setNotifyPhone] = useState(props.initialBlueprint.notifyPhone);
  // voice R1 — missed-call text-back toggle + copy.
  const [missedCallEnabled, setMissedCallEnabled] = useState(
    props.initialBlueprint.missedCallTextBack.enabled,
  );
  const [missedCallMessage, setMissedCallMessage] = useState(
    props.initialBlueprint.missedCallTextBack.message,
  );
  const [publishNotes, setPublishNotes] = useState("");
  const [isSaving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  // ── status (Live/Pause) ───────────────────────────────────────────────
  const [status, setStatus] = useState(props.status);
  const [isFlipping, startFlip] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);

  // ── number assignment ─────────────────────────────────────────────────
  const [number, setNumber] = useState(props.initialNumber);
  const [isAssigning, startAssign] = useTransition();
  const [numberError, setNumberError] = useState<string | null>(null);
  const [numberSaved, setNumberSaved] = useState(false);

  const save = () => {
    setSaveError(null);
    setSavedVersion(null);
    startSave(async () => {
      // voice R1 — keep only fully-filled, numeric rows; coerce low/high.
      const cleanedRanges = quoteRanges
        .map((r) => ({
          service: r.service.trim(),
          low: Number(r.low),
          high: Number(r.high),
        }))
        .filter(
          (r) =>
            r.service.length > 0 &&
            Number.isFinite(r.low) &&
            Number.isFinite(r.high) &&
            r.high >= r.low,
        );
      const result = await saveVoiceBlueprintAction({
        agentId: props.agentId,
        patch: {
          greeting: greeting.trim() || undefined,
          voice,
          capabilities,
          faq: faq.filter((r) => r.q.trim() && r.a.trim()),
          quoteRanges: cleanedRanges,
          notifyPhone: notifyPhone.trim() || undefined,
          missedCallTextBack: {
            enabled: missedCallEnabled,
            // Persist trimmed copy; blank → omit so the send-time default applies.
            message: missedCallMessage.trim() || undefined,
          },
        },
        publishNotes: publishNotes.trim() || undefined,
      });
      if (!result.ok) {
        setSaveError(result.error);
      } else {
        setSavedVersion(result.version);
        setPublishNotes("");
        router.refresh();
      }
    });
  };

  const flipStatus = (next: "live" | "paused") => {
    setStatusError(null);
    startFlip(async () => {
      const result = await setVoiceStatusAction({
        agentId: props.agentId,
        status: next,
      });
      if (!result.ok) {
        setStatusError(result.error);
      } else {
        setStatus(next);
        router.refresh();
      }
    });
  };

  const assignNumber = () => {
    setNumberError(null);
    setNumberSaved(false);
    startAssign(async () => {
      const result = await assignVoiceNumberAction({ fromNumber: number });
      if (!result.ok) {
        setNumberError(result.error);
      } else {
        setNumber(result.fromNumber);
        setNumberSaved(true);
        router.refresh();
      }
    });
  };

  const toggleCap = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  };

  const isLive = status === "live";

  return (
    <div className="space-y-4">
      {/* Live / Pause control */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-card-title">Status</h2>
            <p className="text-xs text-muted-foreground">
              When live, calls to your voice number reach this receptionist.
              Pause to stop answering without losing your settings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            <button
              type="button"
              onClick={() => flipStatus(isLive ? "paused" : "live")}
              disabled={isFlipping}
              className={
                isLive
                  ? "crm-button-secondary h-9 px-4 text-sm"
                  : "crm-button-primary h-9 px-4 text-sm"
              }
            >
              {isFlipping
                ? "Saving…"
                : isLive
                  ? "Pause"
                  : "Go live"}
            </button>
          </div>
        </div>
        {statusError && (
          <p className="mt-2 text-xs text-rose-600">Error: {statusError}</p>
        )}
      </div>

      {/* Voice number */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Voice number</h2>
        <p className="text-xs text-muted-foreground">
          The phone number callers dial to reach this receptionist. Calls to
          this number route to this workspace.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="tel"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
              setNumberSaved(false);
            }}
            placeholder="+1 555 555 5555"
            className="w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={assignNumber}
            disabled={isAssigning}
            className="crm-button-secondary h-10 px-4 text-sm"
          >
            {isAssigning ? "Saving…" : "Save number"}
          </button>
          {numberSaved && (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              ✓ Saved
            </span>
          )}
        </div>
        {numberError && (
          <p className="mt-2 text-xs text-rose-600">Error: {numberError}</p>
        )}
        {!number && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            No number assigned yet — calls can&apos;t reach this agent until you
            add one.
          </p>
        )}
      </div>

      {/* Greeting */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Greeting</h2>
        <p className="text-xs text-muted-foreground">
          The first thing the receptionist says when it answers a call.
        </p>
        <textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          rows={2}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="Thanks for calling! How can I help you today?"
        />
      </div>

      {/* TTS voice */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Voice</h2>
        <p className="text-xs text-muted-foreground">
          The text-to-speech voice the receptionist speaks with. Takes effect on
          the next call after you save.
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

      {/* Tool toggles */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Tools</h2>
        <p className="text-xs text-muted-foreground">
          What the receptionist is allowed to do on a call. Unchecking a tool
          immediately stops the agent from using it.
        </p>
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

      {/* FAQ */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-card-title">FAQ</h2>
            <p className="text-xs text-muted-foreground">
              Question/answer pairs the receptionist uses to answer common
              questions on a call.
            </p>
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

      {/* Quote ranges (get_quote_range) */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-card-title">Pricing ranges</h2>
            <p className="text-xs text-muted-foreground">
              The receptionist never quotes a firm price — it gives the range
              for a service and says a technician confirms the exact price
              on-site. Add a low/high band per service. Services you don&apos;t
              list here get &quot;a technician will confirm.&quot;
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setQuoteRanges([...quoteRanges, { service: "", low: "", high: "" }])
            }
            className="crm-button-secondary h-8 px-3 text-xs"
          >
            + Add service
          </button>
        </div>
        {quoteRanges.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            No pricing ranges yet.
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
                  placeholder="Service (e.g. Furnace repair)"
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
                  inputMode="numeric"
                  min={0}
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
                  inputMode="numeric"
                  min={0}
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

      {/* Team callback number (take_message operator notification) */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Callback alerts</h2>
        <p className="text-xs text-muted-foreground">
          When the receptionist takes a message (a caller is out of scope, it&apos;s
          after-hours, or it&apos;s unsure), the team gets a text here. Leave blank
          to send alerts to your voice number.
        </p>
        <input
          type="tel"
          value={notifyPhone}
          onChange={(e) => setNotifyPhone(e.target.value)}
          placeholder="+1 555 555 5555"
          className="mt-3 w-full max-w-xs rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Missed-call text-back */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-card-title">Missed-call text-back</h2>
            <p className="text-xs text-muted-foreground max-w-2xl">
              When a call is missed or abandoned (the receptionist doesn&apos;t
              pick up — no-answer, busy, or the call drops), automatically text
              the caller back within seconds so the lead never reaches a
              competitor. Calls the receptionist answers don&apos;t get this
              text. Use{" "}
              <code className="font-mono">{"{business}"}</code> and{" "}
              <code className="font-mono">{"{link}"}</code> in your message.
            </p>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={missedCallEnabled}
              onChange={(e) => setMissedCallEnabled(e.target.checked)}
            />
            <span className="font-medium">
              {missedCallEnabled ? "On" : "Off"}
            </span>
          </label>
        </div>
        <textarea
          value={missedCallMessage}
          onChange={(e) => setMissedCallMessage(e.target.value)}
          rows={3}
          disabled={!missedCallEnabled}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
          placeholder="Hi, sorry we missed your call! This is {business} — how can we help? Reply here or book at {link}"
        />
      </div>

      {/* Save */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Save</h2>
        <p className="text-xs text-muted-foreground">
          Saves a new blueprint version (current is v{props.currentVersion}).
          The receptionist uses the new version on its very next call.
        </p>
        <input
          type="text"
          placeholder="Optional change note (e.g. 'New greeting + added pricing FAQ')"
          value={publishNotes}
          onChange={(e) => setPublishNotes(e.target.value)}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="crm-button-primary h-10 px-5 text-sm"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
          {savedVersion !== null && (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              ✓ Saved as v{savedVersion}.
            </span>
          )}
          {saveError && (
            <span className="text-xs text-rose-600">Error: {saveError}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Live
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 ring-1 ring-inset ring-zinc-500/20">
        <span className="size-1.5 rounded-full bg-zinc-500" />
        Paused
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
      <span className="size-1.5 rounded-full bg-muted-foreground/60" />
      Draft
    </span>
  );
}
