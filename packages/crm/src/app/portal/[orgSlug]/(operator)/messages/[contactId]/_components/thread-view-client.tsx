"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { addNoteAction, sendReplyAction } from "@/lib/operator-portal/messages-actions";

type MessageItem = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
};

type NoteItem = {
  id: string;
  authorEmail: string;
  body: string;
  createdAt: string;
};

// Combined timeline item (message or note)
type TimelineItem =
  | ({ kind: "message" } & MessageItem)
  | ({ kind: "note" } & NoteItem);

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type ComposerTab = "reply" | "note";

export function ThreadViewClient({
  orgSlug,
  contactId,
  contactPhone,
  initialMessages,
  initialNotes,
  outboundSmsEnabled,
  accentColor,
}: {
  orgSlug: string;
  contactId: string;
  contactPhone: string | null;
  initialMessages: MessageItem[];
  initialNotes: NoteItem[];
  outboundSmsEnabled: boolean;
  accentColor: string;
}) {
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);
  const [notes, setNotes] = useState<NoteItem[]>(initialNotes);
  const [composerTab, setComposerTab] = useState<ComposerTab>(
    outboundSmsEnabled ? "reply" : "note"
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on mount and when messages/notes update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, notes.length]);

  // Build sorted timeline
  const timeline: TimelineItem[] = [
    ...messages.map((m) => ({ kind: "message" as const, ...m })),
    ...notes.map((n) => ({ kind: "note" as const, ...n })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    if (!outboundSmsEnabled) return;
    if (!contactPhone) {
      setSendError("No phone number on file for this contact.");
      return;
    }

    setSending(true);
    setSendError(null);

    // Optimistic append
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg: MessageItem = {
      id: optimisticId,
      direction: "outbound",
      body,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setDraft("");

    const result = await sendReplyAction({
      orgSlug,
      contactId,
      toNumber: contactPhone,
      body,
    });

    if (!result.ok) {
      // Rollback optimistic message, restore draft, show error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(body);
      setSendError(`Couldn't send — ${result.error}`);
    }

    setSending(false);
  }

  async function handleAddNote() {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setSendError(null);

    const result = await addNoteAction({ orgSlug, contactId, body });

    if (result.ok) {
      const newNote: NoteItem = {
        id: result.noteId,
        authorEmail: "", // filled in server; show "You" optimistically
        body,
        createdAt: new Date().toISOString(),
      };
      setNotes((prev) => [...prev, newNote]);
      setDraft("");
    } else {
      setSendError(`Couldn't save note — ${result.error}`);
    }

    setSending(false);
  }

  function handleSubmit() {
    if (composerTab === "reply") {
      handleSend();
    } else {
      handleAddNote();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Auto-resize textarea
  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <section className="flex flex-col">
      {/* Thread bubbles */}
      <div className="flex flex-col gap-2 px-4 py-4">
        {timeline.length === 0 ? (
          <p className="py-10 text-center text-[13px]" style={{ color: "#999" }}>
            No messages in this thread yet.
          </p>
        ) : (
          timeline.map((item) => {
            if (item.kind === "note") {
              return (
                <motion.div
                  key={`note-${item.id}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-full"
                >
                  <div
                    className="rounded-2xl px-4 py-3 text-[13px]"
                    style={{
                      backgroundColor: "#FEFCE8",
                      border: "1px solid #FDE68A",
                    }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: "#FDE68A", color: "#92400E" }}
                      >
                        Private note
                      </span>
                      <span className="text-[11px]" style={{ color: "#A16207" }}>
                        {item.authorEmail || "You"} · {formatTime(item.createdAt)}
                      </span>
                    </div>
                    <p style={{ color: "#78350F" }}>{item.body}</p>
                  </div>
                </motion.div>
              );
            }

            // SMS message
            const outbound = item.direction === "outbound";
            return (
              <motion.div
                key={`msg-${item.id}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col"
                style={{ alignItems: outbound ? "flex-end" : "flex-start" }}
              >
                <div
                  className="max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                  style={{
                    backgroundColor: outbound ? accentColor : "#FFFFFF",
                    color: outbound ? "#FFFFFF" : "#111",
                    border: outbound ? "none" : "1px solid #E5E5E1",
                    borderBottomRightRadius: outbound ? 4 : undefined,
                    borderBottomLeftRadius: !outbound ? 4 : undefined,
                  }}
                >
                  {item.body}
                </div>
                <span className="mt-0.5 px-1 text-[10px]" style={{ color: "#BBB" }}>
                  {formatTime(item.createdAt)}
                </span>
              </motion.div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer area — sticky at bottom with safe-area-inset */}
      <div
        className="sticky bottom-0 z-10 flex flex-col gap-0"
        style={{
          backgroundColor: "#FFFFFF",
          borderTop: "1px solid #E5E5E1",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
        }}
      >
        {/* Composer tabs */}
        <div
          className="flex border-b"
          style={{ borderColor: "#E5E5E1" }}
          role="tablist"
          aria-label="Compose"
        >
          {outboundSmsEnabled ? (
            <button
              role="tab"
              aria-selected={composerTab === "reply"}
              onClick={() => { setComposerTab("reply"); setSendError(null); setDraft(""); }}
              className="px-4 py-2 text-[12px] font-semibold transition-colors"
              style={{
                color: composerTab === "reply" ? accentColor : "#AAA",
                borderBottom: composerTab === "reply" ? `2px solid ${accentColor}` : "2px solid transparent",
              }}
            >
              Reply
            </button>
          ) : null}
          <button
            role="tab"
            aria-selected={composerTab === "note"}
            onClick={() => { setComposerTab("note"); setSendError(null); setDraft(""); }}
            className="px-4 py-2 text-[12px] font-semibold transition-colors"
            style={{
              color: composerTab === "note" ? "#B45309" : "#AAA",
              borderBottom:
                composerTab === "note" ? "2px solid #B45309" : "2px solid transparent",
            }}
          >
            + Add Note
          </button>
        </div>

        {/* A2P pending notice (reply tab but disabled) */}
        {!outboundSmsEnabled && composerTab === "reply" ? (
          <div className="px-4 py-3">
            <p className="text-[13px]" style={{ color: "#888" }}>
              Texting turns on the moment your carrier registration (A2P) is approved.
            </p>
          </div>
        ) : (
          /* Composer input */
          <div className="flex items-end gap-2 px-3 py-2">
            <div
              className="min-h-[40px] flex-1 rounded-2xl px-3.5 py-2"
              style={{
                backgroundColor: composerTab === "note" ? "#FEFCE8" : "#F7F7F5",
                border: `1px solid ${composerTab === "note" ? "#FDE68A" : "#E5E5E1"}`,
              }}
            >
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={handleDraftChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  composerTab === "reply"
                    ? "Type a message…"
                    : "Add a private note (visible only to you and your team)…"
                }
                rows={1}
                className="w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-[#AAA]"
                style={{
                  color: composerTab === "note" ? "#78350F" : "#111",
                  maxHeight: 120,
                  lineHeight: "1.5",
                }}
                disabled={sending}
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={!draft.trim() || sending}
              className="flex size-10 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
              style={{
                backgroundColor:
                  composerTab === "note" ? "#F59E0B" : accentColor,
                color: "#FFFFFF",
              }}
              aria-label={composerTab === "reply" ? "Send reply" : "Save note"}
            >
              {composerTab === "reply" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M19 3H5C3.9 3 3 3.9 3 5v14l4-4h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Z"
                    fill="currentColor"
                  />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Inline error */}
        <AnimatePresence>
          {sendError ? (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="px-4 pb-1 text-[12px]"
              style={{ color: "#DC2626" }}
            >
              {sendError}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
