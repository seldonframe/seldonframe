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

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  saveAgentTemplateBlueprintAction,
  generateAgentDraftAction,
} from "@/lib/agent-templates/actions";
import type { AgentSurface } from "@/lib/agent-templates/store";
import { VOICE_OPTIONS } from "@/lib/agents/voice/card-status";

type FaqRow = { q: string; a: string };
type QuoteRange = { service: string; low: string; high: string };

type Props = {
  templateId: string;
  surface: AgentSurface;
  initialBlueprint: {
    greeting: string;
    customSkillMd: string;
    voice: string;
    capabilities: string[];
    faq: FaqRow[];
    quoteRanges: Array<{ service: string; low: number; high: number }>;
  };
  allCapabilities: string[];
};

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

  const [isSaving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Refine with a prompt ──
  const [refinePrompt, setRefinePrompt] = useState("");
  const [isRefining, startRefine] = useTransition();
  const [refineError, setRefineError] = useState<React.ReactNode | null>(null);
  const [refined, setRefined] = useState(false);

  const save = () => {
    setSaveError(null);
    setSaved(false);
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
        },
      });
      if (!result.ok) {
        setSaveError(result.error);
      } else {
        setSaved(true);
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
        if (draft.error === "needs_key") {
          setRefineError(
            <span>
              Add your LLM key to generate.{" "}
              <Link
                href="/settings/integrations/llm"
                className="font-medium underline underline-offset-2 hover:opacity-80"
              >
                Add LLM key
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

  return (
    <div className="space-y-4">
      {/* Refine with a prompt — AI-assisted iteration over the whole config */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-start gap-2">
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
            aria-hidden
          >
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-card-title">Refine with a prompt</h2>
            <p className="text-xs text-muted-foreground">
              Describe a change in plain language — we&apos;ll update the fields
              below. Review, then Save.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isRefining) refine();
            }}
            disabled={isRefining}
            placeholder="e.g. Add an FAQ about emergency service and a quote range for drain cleaning"
            className="h-10 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={refine}
            disabled={isRefining}
            className="crm-button-secondary inline-flex h-10 shrink-0 items-center gap-1.5 px-4 text-sm"
          >
            <Sparkles className="size-4" />
            {isRefining ? "Refining…" : "Refine"}
          </button>
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

      {/* Greeting */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Greeting</h2>
        <p className="text-xs text-muted-foreground">{c.greetingHelp}</p>
        <textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          rows={2}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder={c.greetingPlaceholder}
        />
      </div>

      {/* Agent script (core persona — blueprint.customSkillMd) */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">{c.scriptTitle}</h2>
        <p className="text-xs text-muted-foreground">{c.scriptHelp}</p>
        <textarea
          value={customSkillMd}
          onChange={(e) => setCustomSkillMd(e.target.value)}
          rows={16}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed focus:border-primary focus:outline-none"
          placeholder={c.scriptPlaceholder}
        />
      </div>

      {/* TTS voice — voice templates only (chat has no TTS) */}
      {!isChat && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-card-title">Voice</h2>
          <p className="text-xs text-muted-foreground">
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

      {/* Tool toggles */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Tools</h2>
        <p className="text-xs text-muted-foreground">{c.toolsHelp}</p>
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
            <p className="text-xs text-muted-foreground">{c.faqHelp}</p>
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

      {/* Guardrails — quote ranges for the get_quote_range tool */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-card-title">Guardrails</h2>
            <p className="text-xs text-muted-foreground">
              Price ranges the agent may quote. It never states a firm price — it
              gives this low–high band and says a human confirms the final
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
            className="crm-button-secondary h-8 px-3 text-xs"
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

      {/* Save */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Save</h2>
        <p className="text-xs text-muted-foreground">
          Saves your changes to this template. Use Test to try it in the sandbox,
          then Deploy to set it up for a client.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="crm-button-primary h-10 px-5 text-sm"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
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
    </div>
  );
}
