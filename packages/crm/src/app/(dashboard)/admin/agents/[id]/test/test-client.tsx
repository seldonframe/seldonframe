"use client";

// v1.26.2 — agent test sandbox client (interactive chat).
//
// Talks to the public /turn endpoint (SSE branch) so the operator
// experiences the same UX their end customers get on the embed widget.
// State is local — refresh = fresh conversation.

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant" | "system"; content: string };

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
          | { conversation_id?: string; message?: string; reason?: string }
          | null;
        if (data?.conversation_id) setConversationId(data.conversation_id);
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = {
            role: data?.message ? "assistant" : "system",
            content:
              data?.message ?? `Error${data?.reason ? `: ${data.reason}` : ""}`,
          };
          return next;
        });
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
        {messages.map((m, i) => (
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
        ))}
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
          placeholder="Type a message..."
          disabled={sending}
          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
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
