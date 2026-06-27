"use client";

// Starter Pack — the Studio's "Start from a template" resale menu.
//
// A new builder lands on the Agents Studio with an empty roster. Instead of a
// blank canvas, this section shows the curated STARTER_TEMPLATES as design-system
// cards. One click on "Use this template" forks the starter into a
// builder-owned agent_template (createTemplateFromStarterAction) and routes to
// its editor (/studio/agents/[id]) to edit → test → deploy → resell.
//
// "use client": needs useTransition + onClick + the router. The server page
// passes a TRIMMED, serializable list (no blueprints) — the blueprint lives in
// the action's server-side registry, so the client only needs the menu copy.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageSquare, Sparkles, ArrowRight } from "lucide-react";
import { createTemplateFromStarterAction } from "@/lib/agent-templates/actions";

/** The card-facing shape — exactly the menu copy, no blueprint shipped to the
 *  client. Mirrors the STARTER_TEMPLATES public fields minus `blueprint`. */
export type StarterCard = {
  id: string;
  name: string;
  category: string;
  type: "voice_receptionist" | "chat_assistant";
  summary: string;
};

export function StarterPackSection({ starters }: { starters: StarterCard[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Which card is mid-fork (so only its button shows the spinner) + any error.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const use = (starterId: string) => {
    setError(null);
    setBusyId(starterId);
    startTransition(async () => {
      const result = await createTemplateFromStarterAction({ starterId });
      if (!result.ok) {
        setBusyId(null);
        setError(
          result.error === "unauthorized"
            ? "Please sign in to use a template."
            : `Couldn't create the agent — ${result.error}`,
        );
        return;
      }
      // Route to the new owned template's editor to edit → test → deploy.
      router.push(`/studio/agents/${result.id}`);
    });
  };

  return (
    <section aria-labelledby="starter-pack-heading" className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <h2
            id="starter-pack-heading"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            Start from a template
          </h2>
          <p className="text-sm text-muted-foreground">
            Fork a ready-made agent, customize it, then deploy it to your
            clients. You own and can resell every one.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {starters.map((s) => {
          const busy = isPending && busyId === s.id;
          const Icon = s.type === "voice_receptionist" ? Phone : MessageSquare;
          return (
            <article
              key={s.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-(--shadow-xs)"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {s.category}
                </span>
              </div>

              <h3 className="mt-3 text-sm font-semibold text-foreground">
                {s.name}
              </h3>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
                {s.summary}
              </p>

              <button
                type="button"
                onClick={() => use(s.id)}
                disabled={isPending}
                className="crm-button-secondary mt-4 inline-flex h-9 items-center justify-center gap-1.5 px-4 text-sm disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Sparkles className="size-4 animate-pulse" />
                    Creating…
                  </>
                ) : (
                  <>
                    Use this template
                    <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </section>
  );
}
