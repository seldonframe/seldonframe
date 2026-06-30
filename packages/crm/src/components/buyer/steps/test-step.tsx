"use client";

// Marketplace buyer surface — the test / "hear it work" step.
//
// The penultimate step: let the buyer experience their agent BEFORE going live.
// Ported STRUCTURE from the Claude Design export's "Hear it work" screen, re-
// skinned to the real brand (teal #00897B, cream, mono number — no violet):
//
//   • Voice agents: show the agent's phone number as the "test line" with a big
//     "Call this number now" tel: link, plus an honest "this is your real agent
//     on a test line — it won't book actual jobs until you go live" note. (We
//     also expose the chat sandbox below so a buyer at a desk can try it without
//     calling.)
//   • The chat sandbox: an inline chat that runs against the buyer's OWN agent
//     persona via `runBuyerTestTurnAction` — MONEY-SAFE by construction (the
//     action runs every turn in testMode: no real booking, no SMS, nothing
//     persisted). If the builder hasn't configured a key yet the action returns
//     `not_ready` and we show a calm "still being set up" note (never a crash).
//
// SKIPPABLE: the buyer can always skip ahead to go-live. The step owns its own
// footer (Back + Skip/Continue) — the generic wizard footer is suppressed.

import { useEffect, useRef, useState } from "react";

import { BUYER } from "@/components/buyer/theme";
import { runBuyerTestTurnAction } from "@/app/(buyer)/agent/actions";

export type TestStepSeed = {
  /** The agent's phone number (E.164), if any — the voice "test line". */
  phoneNumber: string | null;
  /** Whether this agent answers a phone (a voice surface). Drives whether the
   *  call card or the chat-only layout shows. */
  isVoice: boolean;
  /** The agent's opening line, shown as the first chat bubble. */
  greeting: string;
};

export type TestStepProps = {
  deploymentId: string;
  seed: TestStepSeed;
  canGoBack: boolean;
  onBack: () => void;
  /** Record the step done + advance (the generic wizard path). */
  onContinue: () => void;
};

type ChatMsg = { role: "user" | "assistant" | "system"; content: string; note?: string };

/** "+16025550148" → "(602) 555-0148"; non-NANP returned as-is. */
function prettyPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function TestStep({ deploymentId, seed, canGoBack, onBack, onContinue }: TestStepProps) {
  const greeting = seed.greeting?.trim() || "Thanks for calling! How can I help today?";
  const [chatOpen, setChatOpen] = useState(!seed.isVoice); // chat-only agents open straight into chat
  const [messages, setMessages] = useState<ChatMsg[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);

    const priorTurns = messages
      .filter((m): m is ChatMsg & { role: "user" | "assistant" } =>
        m.role === "user" || m.role === "assistant",
      )
      .map((m) => ({ role: m.role, content: m.content }));
    const outgoing = [...priorTurns, { role: "user" as const, content: msg }];
    setMessages((m) => [...m, { role: "user", content: msg }]);

    try {
      const result = await runBuyerTestTurnAction(deploymentId, { messages: outgoing });
      if (result.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: result.reply || "…",
            note: result.toolNotes.length ? result.toolNotes.join(" · ") : undefined,
          },
        ]);
      } else if (result.error === "not_ready") {
        setMessages((m) => [
          ...m,
          {
            role: "system",
            content:
              result.message ??
              "This agent is still being set up — try the test again in a moment.",
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "system",
            content: result.message ?? "Couldn’t run that — please try again in a moment.",
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "system", content: "Connection hiccup — please try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ textAlign: "center" }}>
      <div aria-hidden style={iconWrap}>
        {seed.isVoice ? "☎" : "💬"}
      </div>
      <h2 style={hHeading}>Hear it work</h2>
      <p style={hSub}>
        {seed.isVoice
          ? "Talk to your agent before you go live. Call the number below right now."
          : "Chat with your agent before you go live — exactly how a customer would."}
      </p>

      {/* ── voice test line ─────────────────────────────────────────────────── */}
      {seed.isVoice && seed.phoneNumber ? (
        <div style={testLineCard}>
          <div style={testLineLabel}>Your test line</div>
          <div style={testLineNumber}>{prettyPhone(seed.phoneNumber)}</div>
          <a href={`tel:${seed.phoneNumber}`} style={callBtn}>
            ☎ Call this number now
          </a>
        </div>
      ) : null}

      {/* ── chat toggle (voice) / always-on (chat) ──────────────────────────── */}
      {seed.isVoice ? (
        <button type="button" onClick={() => setChatOpen((v) => !v)} style={chatToggle}>
          💬 {chatOpen ? "Hide the chat" : "Or try the chat instead"}
        </button>
      ) : null}

      {chatOpen ? (
        <div style={chatPanel}>
          <div ref={scrollRef} style={chatScroll}>
            {messages.map((m, i) => {
              if (m.role === "system") {
                return (
                  <div key={i} style={chatSystem}>
                    {m.content}
                  </div>
                );
              }
              const isUser = m.role === "user";
              return (
                <div
                  key={i}
                  style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}
                >
                  <div style={isUser ? bubbleUser : bubbleAgent}>
                    {m.content || (m.role === "assistant" && sending ? "…" : "")}
                  </div>
                  {m.note ? <div style={toolNote}>🔧 {m.note}</div> : null}
                </div>
              );
            })}
            {sending ? (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={bubbleAgent}>…</div>
              </div>
            ) : null}
          </div>
          <form
            style={chatForm}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              className="sf-buyer-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              disabled={sending}
              style={chatInput}
              aria-label="Test message"
            />
            <button type="submit" disabled={sending || !input.trim()} style={sendBtn}>
              {sending ? "…" : "Send"}
            </button>
          </form>
        </div>
      ) : null}

      <p style={honestNote}>
        This is your real agent on a test line — it won’t book actual jobs until you go live.
      </p>

      {/* ── footer (Back + Skip/Continue) — the step is skippable ────────────── */}
      <div style={{ ...footerRow, justifyContent: canGoBack ? "space-between" : "flex-end" }}>
        {canGoBack ? (
          <button type="button" onClick={onBack} style={navBtnGhost}>
            ← Back
          </button>
        ) : null}
        <button type="button" onClick={onContinue} style={navBtnPrimary}>
          Looks good →
        </button>
      </div>
    </div>
  );
}

// ─── styles (BUYER tokens; teal + cream, never violet) ───────────────────────

const iconWrap: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 62,
  height: 62,
  borderRadius: 18,
  background: BUYER.accentSoft,
  color: BUYER.accent,
  marginBottom: 18,
  fontSize: 27,
};
const hHeading: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 21,
  fontWeight: 650,
  letterSpacing: "-0.018em",
};
const hSub: React.CSSProperties = {
  margin: "0 auto 22px",
  maxWidth: 400,
  fontSize: 15,
  color: BUYER.ink2,
  lineHeight: 1.5,
};
const testLineCard: React.CSSProperties = {
  padding: 24,
  borderRadius: 18,
  background: BUYER.paper2,
  border: `1px solid ${BUYER.line}`,
  marginBottom: 14,
};
const testLineLabel: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: BUYER.ink3,
  fontWeight: 600,
  marginBottom: 8,
};
const testLineNumber: React.CSSProperties = {
  fontFamily: BUYER.fontMono,
  fontSize: "clamp(26px,7vw,34px)",
  fontWeight: 600,
  letterSpacing: "-0.01em",
  marginBottom: 18,
};
const callBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 9,
  height: 48,
  padding: "0 26px",
  borderRadius: 14,
  background: BUYER.accent,
  color: BUYER.accentContrast,
  fontSize: 16,
  fontWeight: 600,
  textDecoration: "none",
  boxShadow: BUYER.shadowAccent,
};
const chatToggle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: BUYER.fontSans,
  fontSize: 14,
  fontWeight: 600,
  color: BUYER.accent,
  padding: 8,
};
const chatPanel: React.CSSProperties = {
  marginTop: 14,
  borderRadius: 18,
  background: BUYER.paper2,
  border: `1px solid ${BUYER.line}`,
  overflow: "hidden",
  textAlign: "left",
};
const chatScroll: React.CSSProperties = {
  height: 280,
  overflowY: "auto",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const bubbleAgent: React.CSSProperties = {
  alignSelf: "flex-start",
  maxWidth: "85%",
  padding: "10px 14px",
  borderRadius: "16px 16px 16px 4px",
  background: BUYER.card,
  border: `1px solid ${BUYER.line}`,
  fontSize: 14,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};
const bubbleUser: React.CSSProperties = {
  alignSelf: "flex-end",
  maxWidth: "85%",
  padding: "10px 14px",
  borderRadius: "16px 16px 4px 16px",
  background: BUYER.accent,
  color: BUYER.accentContrast,
  fontSize: 14,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};
const chatSystem: React.CSSProperties = {
  alignSelf: "center",
  maxWidth: "92%",
  padding: "8px 12px",
  borderRadius: 12,
  background: BUYER.amberSoft,
  color: BUYER.amber,
  fontSize: 12.5,
  fontStyle: "italic",
  textAlign: "center",
};
const toolNote: React.CSSProperties = {
  margin: "4px 2px 0",
  fontSize: 11,
  fontStyle: "italic",
  color: BUYER.ink3,
};
const chatForm: React.CSSProperties = {
  display: "flex",
  gap: 8,
  borderTop: `1px solid ${BUYER.line}`,
  padding: 12,
  background: BUYER.card,
};
const chatInput: React.CSSProperties = {
  flex: 1,
  padding: "10px 13px",
  fontSize: 14,
  fontFamily: BUYER.fontSans,
  color: BUYER.ink,
  background: BUYER.card,
  border: `1px solid ${BUYER.lineStrong}`,
  borderRadius: 12,
  outline: "none",
  boxSizing: "border-box",
};
const sendBtn: React.CSSProperties = {
  flexShrink: 0,
  height: 42,
  padding: "0 18px",
  borderRadius: 12,
  border: "none",
  background: BUYER.accent,
  color: BUYER.accentContrast,
  fontFamily: BUYER.fontSans,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const honestNote: React.CSSProperties = {
  margin: "18px 0 0",
  fontSize: 12.5,
  color: BUYER.ink3,
  lineHeight: 1.5,
};
const footerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 26,
};
const navBtnPrimary: React.CSSProperties = {
  fontFamily: BUYER.fontSans,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 48,
  padding: "0 22px",
  borderRadius: 14,
  border: "none",
  background: BUYER.accent,
  color: BUYER.accentContrast,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: BUYER.shadowAccent,
};
const navBtnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: BUYER.fontSans,
  fontSize: 15,
  fontWeight: 550,
  color: BUYER.ink2,
  padding: "10px 4px",
};
