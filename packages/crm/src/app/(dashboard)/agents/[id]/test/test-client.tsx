"use client";

// v1.27.5 — agent test sandbox client (interactive chat with diagnostic
// surfacing).
//
// Talks to the public /turn endpoint (SSE branch). Differences from the
// embed widget UX:
//   - Surfaces the REAL error reason (e.g. llm_credit_exhausted) inline
//     instead of the customer-facing "hiccup" fallback. Runtime ships the
//     test-mode diagnostic in fallbackMessage when conversation.status='test'.
//   - Halts the input on degraded turns so operators don't loop the same
//     error trying to recover; surfaces a "Retry" button instead.

import { useEffect, useRef, useState } from "react";

type Msg = {
  role: "user" | "assistant" | "system";
  content: string;
  /** When set, this assistant message represents a runtime degradation
   *  (Anthropic error, no key, budget exhausted) rather than a real
   *  agent reply. */
  degraded?: { reason: string };
};

export function TestSandboxClient(props: {
  agentName: string;
  turnUrl: string;
  greeting: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: props.greeting },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [halted, setHalted] = useState<{ reason: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(props.turnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: msg,
          stream: true,
        }),
      });

      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (!res.ok || ctype.indexOf("text/event-stream") === -1) {
        const data = (await res.json().catch(() => null)) as
          | {
              conversation_id?: string;
              message?: string;
              reason?: string;
              degraded?: boolean;
            }
          | null;
        if (data?.conversation_id) setConversationId(data.conversation_id);
        const reason = data?.reason ?? "unknown_error";
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = {
            role: data?.message ? "assistant" : "system",
            content:
              data?.message ?? `Error${data?.reason ? `: ${data.reason}` : ""}`,
            degraded: data?.degraded ? { reason } : undefined,
          };
          return next;
        });
        if (data?.degraded) {
          setHalted({ reason });
        }
        return;
      }

      // SSE consumer
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "delta";
      let assistantText = "";
      while (true) {
        const step = await reader.read();
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const json = JSON.parse(payload);
              if (currentEvent === "start" && json.conversation_id) {
                setConversationId(json.conversation_id);
              } else if (currentEvent === "delta" && json.text) {
                assistantText += json.text;
                setMessages((m) => {
                  const next = [...m];
                  next[next.length - 1] = {
                    role: "assistant",
                    content: assistantText,
                  };
                  return next;
                });
              } else if (currentEvent === "done") {
                if (json.conversation_id) {
                  setConversationId(json.conversation_id);
                }
                if (json.degraded) {
                  // Runtime returned an unrecoverable error mid-stream.
                  // Tag the assistant message as degraded + halt input so
                  // the operator doesn't loop the same error trying to
                  // type past it.
                  const reason = json.reason ?? "unknown_error";
                  setMessages((m) => {
                    const next = [...m];
                    const last = next[next.length - 1];
                    if (last && last.role === "assistant") {
                      next[next.length - 1] = {
                        ...last,
                        degraded: { reason },
                      };
                    }
                    return next;
                  });
                  setHalted({ reason });
                }
                if (json.validators_critical_failed) {
                  setMessages((m) => [
                    ...m,
                    {
                      role: "system",
                      content:
                        "⚠ Critical validator failed — response was replaced with the safe fallback.",
                    },
                  ]);
                }
              } else if (currentEvent === "error") {
                setMessages((m) => {
                  const next = [...m];
                  next[next.length - 1] = {
                    role: "system",
                    content: `Error: ${json.reason ?? "unknown"}`,
                  };
                  return next;
                });
              }
            } catch {
              /* ignore malformed chunk */
            }
          }
        }
      }
    } catch (err) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: "system",
          content: `Connection error: ${err instanceof Error ? err.message : String(err)}`,
        };
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <article className="rounded-xl border bg-card p-0 overflow-hidden">
      <div
        ref={scrollRef}
        className="h-[480px] overflow-y-auto px-5 py-4 space-y-3 bg-[hsl(var(--color-surface-muted))]"
      >
        {messages.map((m, i) => {
          if (m.degraded) {
            return (
              <div
                key={i}
                className="mr-auto max-w-[90%] rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
              >
                <p className="font-medium text-xs uppercase tracking-wide opacity-70">
                  ⛔ Runtime error · {m.degraded.reason}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
              </div>
            );
          }
          return (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : m.role === "assistant"
                    ? "mr-auto bg-card border"
                    : "mx-auto text-xs italic text-muted-foreground"
              }`}
            >
              {m.content || (m.role === "assistant" && sending ? "…" : "")}
            </div>
          );
        })}
        {halted && (
          <div className="mr-auto max-w-[90%] rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
            <p>
              Conversation halted. Fix the issue above (typically: configure
              an LLM key, add Anthropic credits, raise the daily token budget,
              or wait out a rate limit), then click <strong>Reset & retry</strong>.
            </p>
            <button
              type="button"
              onClick={() => {
                setHalted(null);
                setConversationId(null);
                setMessages([
                  { role: "assistant", content: props.greeting },
                  {
                    role: "system",
                    content:
                      "↻ Conversation reset. The next turn will use a fresh session.",
                  },
                ]);
              }}
              className="mt-2 rounded-md border border-current/30 px-3 py-1 font-medium hover:bg-current/10"
            >
              ↻ Reset & retry
            </button>
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
          placeholder={halted ? "Resolve the error above to continue" : "Type a message..."}
          disabled={sending || !!halted}
          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim() || !!halted}
          className="crm-button-primary h-10 px-5 text-sm"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
      {conversationId && (
        <div className="border-t bg-card px-3 py-2 text-xs text-muted-foreground">
          conversation_id:{" "}
          <code className="font-mono">{conversationId}</code> — query with the{" "}
          <code className="font-mono">get_agent_conversation</code> MCP tool to
          inspect tool calls + validator results.
        </div>
      )}
    </article>
  );
}
