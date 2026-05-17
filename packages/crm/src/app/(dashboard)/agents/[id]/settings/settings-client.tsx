"use client";

// v1.27.0 — interactive blueprint editor. Edits buffer client-side;
// "Save" sends the full patch to the server action which calls
// updateAgentBlueprint (bumps version + writes agent_versions row).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAgentBlueprintAction } from "@/lib/agents/actions";

type FaqRow = { q: string; a: string };
type PricingRow = { label: string; amount: number; currency: string };

type Props = {
  agentId: string;
  currentVersion: number;
  initialBlueprint: {
    greeting: string;
    capabilities: string[];
    faq: FaqRow[];
    pricingFacts: PricingRow[];
    customSkillMd: string;
  };
  /** Platform skill pack rendered for this agent's archetype, as it
   *  would appear in the live system prompt (minus hard-rules). Shown
   *  as the textarea's initial value when no override is set, and used
   *  by "Reset to default" to revert. */
  defaultSkillMd: string;
  allCapabilities: string[];
};

const CUSTOM_SKILL_MD_MAX = 8000;

export function SettingsClient(props: Props) {
  const [greeting, setGreeting] = useState(props.initialBlueprint.greeting);
  const [capabilities, setCapabilities] = useState<string[]>(
    props.initialBlueprint.capabilities,
  );
  const [faq, setFaq] = useState<FaqRow[]>(props.initialBlueprint.faq);
  const [pricingFacts, setPricingFacts] = useState<PricingRow[]>(
    props.initialBlueprint.pricingFacts,
  );
  // Pre-fill with the operator's override when set, otherwise the
  // platform default — so the textarea always reflects what's
  // actually running. Edits to "the default" become an override
  // (same shape as if the operator typed their own from scratch).
  const [customSkillMd, setCustomSkillMd] = useState(
    props.initialBlueprint.customSkillMd?.trim().length > 0
      ? props.initialBlueprint.customSkillMd
      : props.defaultSkillMd,
  );
  const isUnchangedFromDefault = customSkillMd.trim() === props.defaultSkillMd.trim();
  const [publishNotes, setPublishNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const router = useRouter();

  const save = () => {
    setError(null);
    setSavedVersion(null);
    startTransition(async () => {
      const result = await saveAgentBlueprintAction({
        agentId: props.agentId,
        patch: {
          greeting: greeting.trim() || undefined,
          capabilities,
          faq: faq.filter((r) => r.q.trim() && r.a.trim()),
          pricingFacts: pricingFacts.filter(
            (r) => r.label.trim() && r.amount >= 0,
          ),
          // If the textarea still matches the platform default
          // verbatim, store an empty string — keeps the blueprint
          // clean and means future platform skill-pack edits will
          // automatically flow through. Operator edits → store the
          // edited copy as an override.
          customSkillMd: isUnchangedFromDefault ? "" : customSkillMd.trim(),
        },
        publishNotes: publishNotes.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setSavedVersion(result.version);
        setPublishNotes("");
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
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Greeting</h2>
        <p className="text-xs text-muted-foreground">
          First message the customer sees when they open the chat.
        </p>
        <textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          rows={2}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="Hi! How can I help you today?"
        />
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Capabilities</h2>
        <p className="text-xs text-muted-foreground">
          Tools the agent can call. Removing a capability immediately stops the
          agent from using it.
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

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-card-title">FAQ</h2>
            <p className="text-xs text-muted-foreground">
              Question/answer pairs the agent uses to answer common questions.
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

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-card-title">SKILL.md</h2>
            <p className="text-xs text-muted-foreground">
              This is the playbook the agent is using right now (rendered
              from the platform's default skill pack). Edit any line and
              save — your edits become the agent's SKILL.md. Reset to
              default any time to fall back to the platform copy.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] ${
                isUnchangedFromDefault
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/10 text-primary"
              }`}
              aria-live="polite"
            >
              {isUnchangedFromDefault ? "Platform default" : "Customized"}
            </span>
            <span
              className={`font-mono text-[10px] ${
                customSkillMd.length > CUSTOM_SKILL_MD_MAX
                  ? "text-rose-600"
                  : "text-muted-foreground"
              }`}
            >
              {customSkillMd.length.toLocaleString()} / {CUSTOM_SKILL_MD_MAX.toLocaleString()}
            </span>
          </div>
        </div>
        <textarea
          value={customSkillMd}
          onChange={(e) => setCustomSkillMd(e.target.value)}
          rows={18}
          maxLength={CUSTOM_SKILL_MD_MAX + 256}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed focus:border-primary focus:outline-none"
          spellCheck={false}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Hard safety rules + pricing facts are always appended below
            this section — you can't disable them by editing here.
          </p>
          <button
            type="button"
            onClick={() => setCustomSkillMd(props.defaultSkillMd)}
            disabled={isUnchangedFromDefault}
            className="crm-button-ghost h-7 px-2.5 text-[11px] disabled:opacity-40"
          >
            Reset to default
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-card-title">Pricing facts</h2>
            <p className="text-xs text-muted-foreground">
              The ONLY prices the agent is allowed to quote. Anything not here
              gets blocked by the validator.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setPricingFacts([
                ...pricingFacts,
                { label: "", amount: 0, currency: "USD" },
              ])
            }
            className="crm-button-secondary h-8 px-3 text-xs"
          >
            + Add row
          </button>
        </div>
        {pricingFacts.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            No pricing facts yet — agent will refuse to quote any price.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {pricingFacts.map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 rounded-md border bg-background p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
              >
                <input
                  type="text"
                  placeholder="Label (e.g. 'Service call')"
                  value={row.label}
                  onChange={(e) => {
                    const next = [...pricingFacts];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setPricingFacts(next);
                  }}
                  className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                />
                <input
                  type="number"
                  placeholder="Amount"
                  value={row.amount}
                  step="0.01"
                  min="0"
                  onChange={(e) => {
                    const next = [...pricingFacts];
                    next[idx] = {
                      ...next[idx],
                      amount: Number(e.target.value),
                    };
                    setPricingFacts(next);
                  }}
                  className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="USD"
                  value={row.currency}
                  onChange={(e) => {
                    const next = [...pricingFacts];
                    next[idx] = {
                      ...next[idx],
                      currency: e.target.value.toUpperCase(),
                    };
                    setPricingFacts(next);
                  }}
                  className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    setPricingFacts(pricingFacts.filter((_, i) => i !== idx))
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

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-card-title">Save</h2>
        <p className="text-xs text-muted-foreground">
          Saves a new blueprint version (current is v{props.currentVersion}).
          The agent uses the new version on its very next conversation —
          existing chats keep using their pinned version.
        </p>
        <input
          type="text"
          placeholder="Optional change note (e.g. 'Added emergency-call FAQ')"
          value={publishNotes}
          onChange={(e) => setPublishNotes(e.target.value)}
          className="mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="crm-button-primary h-10 px-5 text-sm"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
          {savedVersion !== null && (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              ✓ Saved as v{savedVersion}. Re-run evals before promoting to live.
            </span>
          )}
          {error && (
            <span className="text-xs text-rose-600">Error: {error}</span>
          )}
        </div>
      </div>
    </div>
  );
}
