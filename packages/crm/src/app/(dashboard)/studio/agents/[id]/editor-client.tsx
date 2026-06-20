"use client";

// ICP-3 — the Agent TEMPLATE editor (client).
//
// Reuses the voice-receptionist editor's section layout + interaction model
// (automations/voice-receptionist/editor-client.tsx): edits buffer client-side,
// "Save changes" sends the full patch to saveAgentTemplateBlueprintAction. The
// editable surface is the TEMPLATE blueprint — greeting, persona script
// (customSkillMd), TTS voice, tools, FAQ. Deployment-only controls (number
// assignment, Live/Pause, missed-call text-back) are intentionally NOT here:
// those belong to a deployment, configured per-client in a later task. There is
// also NO "Test" or "Deploy" button yet (tasks 1.2 / 1.3).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAgentTemplateBlueprintAction } from "@/lib/agent-templates/actions";
import { VOICE_OPTIONS } from "@/lib/agents/voice/card-status";

type FaqRow = { q: string; a: string };

type Props = {
  templateId: string;
  initialBlueprint: {
    greeting: string;
    customSkillMd: string;
    voice: string;
    capabilities: string[];
    faq: FaqRow[];
  };
  allCapabilities: string[];
};

export function AgentTemplateEditor(props: Props) {
  const router = useRouter();

  const [greeting, setGreeting] = useState(props.initialBlueprint.greeting);
  const [customSkillMd, setCustomSkillMd] = useState(
    props.initialBlueprint.customSkillMd,
  );
  const [voice, setVoice] = useState(props.initialBlueprint.voice);
  const [capabilities, setCapabilities] = useState<string[]>(
    props.initialBlueprint.capabilities,
  );
  const [faq, setFaq] = useState<FaqRow[]>(props.initialBlueprint.faq);

  const [isSaving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaveError(null);
    setSaved(false);
    startSave(async () => {
      const result = await saveAgentTemplateBlueprintAction({
        templateId: props.templateId,
        patch: {
          greeting: greeting.trim() || undefined,
          customSkillMd: customSkillMd.trim() || undefined,
          voice,
          capabilities,
          faq: faq.filter((r) => r.q.trim() && r.a.trim()),
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

  const toggleCap = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  };

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Greeting</h2>
        <p className="text-xs text-muted-foreground">
          The first thing the receptionist says when it answers a call. Each
          client that deploys this template starts from this greeting.
        </p>
        <textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          rows={2}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="Thanks for calling! How can I help you today?"
        />
      </div>

      {/* Receptionist script (core persona — blueprint.customSkillMd) */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Receptionist script</h2>
        <p className="text-xs text-muted-foreground">
          The agent&apos;s core instructions — what it says and does on every
          call. This is the heart of your template.
        </p>
        <textarea
          value={customSkillMd}
          onChange={(e) => setCustomSkillMd(e.target.value)}
          rows={16}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed focus:border-primary focus:outline-none"
          placeholder="You are the receptionist for {business}. You are warm, concise, and helpful…"
        />
      </div>

      {/* TTS voice */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Voice</h2>
        <p className="text-xs text-muted-foreground">
          The text-to-speech voice the receptionist speaks with.
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
          What the receptionist is allowed to do on a call. These carry into
          every deployment of this template.
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

      {/* Save */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Save</h2>
        <p className="text-xs text-muted-foreground">
          Saves your changes to this template. Testing it live and publishing it
          come next.
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
