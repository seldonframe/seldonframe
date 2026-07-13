"use client";

// ICP-3 (task 1.2) — the agent TEMPLATE test sandbox (client island).
//
// A simple chat UI (message list + text input + send) over
// testAgentTemplateTurn. Differences from the live embed widget:
//   - Sandbox: every turn runs in testMode (no real bookings, no persistence).
//   - Surfaces tool calls as a small italic note ("checked availability") so the
//     builder can see the agent reaching for a tool.
//   - On no_llm_key, halts and shows a prompt linking to Settings.
//   - A "Mark as tested" button flips the template draft→tested once the builder
//     is satisfied (manual gate for v1).

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  testAgentTemplateTurn,
  markAgentTemplateTestedAction,
} from "@/lib/agent-templates/test-actions";
import type { StatelessToolCall } from "@/lib/agents/stateless-turn";
import { LlmKeyDialog } from "@/components/integrations/llm-key-dialog";

type Msg = {
  role: "user" | "assistant" | "system";
  content: string;
  /** Tool calls the agent made on this assistant turn (for the small note). */
  toolCalls?: StatelessToolCall[];
};

/** Friendly, customer-safe labels for the tools a voice-receptionist can call.
 *  Falls back to the raw tool name (humanized) for anything unmapped. */
const TOOL_LABELS: Record<string, string> = {
  look_up_availability: "checked availability",
  book_appointment: "booked an appointment (simulated)",
  find_my_existing_appointment: "looked up an existing appointment",
  reschedule_appointment: "rescheduled an appointment (simulated)",
  cancel_appointment: "canceled an appointment (simulated)",
  escalate_to_human: "escalated to a human (simulated)",
  take_message: "took a message (simulated)",
  get_quote_range: "looked up a quote range",
  provide_faq_answer: "answered from the FAQ",
};

function labelForTool(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

export function TemplateTestClient(props: {
  templateId: string;
  greeting: string;
  status: string;
  /** "byok" | "platform" | "none" — drives the pre-flight banner. */
  keyMode: "byok" | "platform" | "none";
}) {
  const router = useRouter();

  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: props.greeting },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Magic first-run: the Studio sandbox is the unbounded-COGS build/test
  // work, so it requires the operator's OWN key (keyMode "byok"). Both
  // "platform" (on the free first-workspace allowance) and "none" block the
  // sandbox with an actionable "add your key" prompt — the first workspace +
  // its embedded chatbot stay free, but testing agents to resell needs a key.
  const [noKey, setNoKey] = useState(props.keyMode !== "byok");
  const scrollRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState(props.status);
  const [marking, startMark] = useTransition();
  const [markError, setMarkError] = useState<string | null>(null);
  // In-place BYOK modal (record-v3 S4a) — replaces the needs_byok Link to
  // /settings/integrations/llm, which used to bounce the operator off this
  // sandbox. There's no single "retry" call to re-run here (the banner is
  // keyMode-derived, not tied to one blocked action) — onSaved just clears
  // the gate so the next Send attempt goes through.
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending || noKey) return;
    setInput("");
    setSending(true);

    // Build the history we send to the action: every prior user/assistant text
    // turn plus this new user message. (System notes are UI-only.)
    const priorTurns = messages
      .filter((m): m is Msg & { role: "user" | "assistant" } =>
        m.role === "user" || m.role === "assistant",
      )
      .map((m) => ({ role: m.role, content: m.content }));
    const outgoing = [...priorTurns, { role: "user" as const, content: msg }];

    setMessages((m) => [...m, { role: "user", content: msg }]);

    try {
      const result = await testAgentTemplateTurn({
        templateId: props.templateId,
        messages: outgoing,
      });

      if (result.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: result.reply || "…",
            toolCalls: result.toolCalls?.length ? result.toolCalls : undefined,
          },
        ]);
      } else if (result.error === "no_llm_key") {
        setNoKey(true);
        setMessages((m) => [
          ...m,
          {
            role: "system",
            content:
              result.message ??
              "Add your Anthropic key in Settings to build + test agents — your first workspace stays free.",
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "system",
            content:
              result.message ??
              `Couldn't run the turn (${result.error}). Try again in a moment.`,
          },
        ]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          content: `Connection error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const markTested = () => {
    setMarkError(null);
    startMark(async () => {
      const result = await markAgentTemplateTestedAction({
        templateId: props.templateId,
      });
      if (result.ok) {
        setStatus("tested");
        router.refresh();
      } else {
        setMarkError(result.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* BYOK gate — the Studio sandbox is unbounded-COGS build/test work, so
          it needs the operator's own key. Shown whenever keyMode !== "byok"
          (both "platform" and "none"). The first workspace + its embedded
          chatbot stay free on the platform key; only building agents to
          resell needs a key. Friendly, actionable prompt to Settings. */}
      {noKey && (
        <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200">
          <span aria-hidden className="text-base leading-none pt-0.5">
            ✨
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium">Add your key to test agents</p>
            <p className="mt-0.5 opacity-90">
              Your first workspace stays free on us. Building and testing your
              own agents runs on your Anthropic key — add one to start chatting
              with this agent in the sandbox.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setKeyDialogOpen(true)}
            className="shrink-0 rounded-md border border-current/30 px-3 py-1 text-xs font-medium hover:bg-current/10"
          >
            Add your key &rarr;
          </button>
        </div>
      )}

      <LlmKeyDialog
        open={keyDialogOpen}
        onOpenChange={setKeyDialogOpen}
        onSaved={() => setNoKey(false)}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Chat */}
        <article className="rounded-xl border bg-card p-0 overflow-hidden">
          <div
            ref={scrollRef}
            className="h-[480px] overflow-y-auto px-5 py-4 space-y-3 bg-[hsl(var(--color-surface-muted))]"
          >
            {messages.map((m, i) => {
              if (m.role === "system") {
                return (
                  <div
                    key={i}
                    className="mx-auto max-w-[90%] rounded-lg bg-muted px-3 py-2 text-center text-xs italic text-muted-foreground"
                  >
                    {m.content}
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className={
                    m.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"
                  }
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border"
                    }`}
                  >
                    {m.content || (m.role === "assistant" && sending ? "…" : "")}
                  </div>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <p className="mt-1 px-1 text-[11px] italic text-muted-foreground">
                      🔧{" "}
                      {m.toolCalls
                        .map((tc) => labelForTool(tc.name))
                        .join(" · ")}
                    </p>
                  )}
                </div>
              );
            })}
            {sending && (
              <div className="flex flex-col items-start">
                <div className="max-w-[85%] rounded-2xl border bg-card px-4 py-2 text-sm text-muted-foreground">
                  …
                </div>
              </div>
            )}
          </div>
          <form
            className="flex gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                noKey ? "Add an LLM key to start testing" : "Type a message…"
              }
              disabled={sending || noKey}
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || noKey || !input.trim()}
              className="crm-button-primary h-10 px-5 text-sm"
            >
              {sending ? "…" : "Send"}
            </button>
          </form>
        </article>

        {/* Side panel — what this sandbox is + the mark-as-tested gate. */}
        <aside className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Sandbox
            </p>
            <ul className="mt-3 space-y-2 text-[11px] text-muted-foreground">
              <li>• Bookings &amp; messages are simulated — nothing is saved.</li>
              <li>• No phone number, no real call, no deployment.</li>
              <li>
                • Runs the exact persona, FAQ, and tools this template ships
                with.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Ready to ship?
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Happy with how it sounds? Mark it tested, then deploy it to a
              client.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {status === "draft" ? (
                <button
                  type="button"
                  onClick={markTested}
                  disabled={marking}
                  className="crm-button-secondary h-8 px-3 text-xs"
                >
                  {marking ? "Saving…" : "Mark as tested"}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  ✓ Marked {status}
                </span>
              )}
              <Link
                href={`/studio/agents/${props.templateId}/deploy`}
                className="crm-button-primary h-8 px-3 text-xs"
              >
                Deploy
              </Link>
            </div>
            {markError && (
              <p className="mt-2 text-[11px] text-rose-600">Error: {markError}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
