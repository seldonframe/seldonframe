"use client";

// SeldonChat reborn (win-ladder plan, 2026-07-04) — the front-door copilot
// dock. Unlike the 2026-05-18 removal (a talking helper wired to
// runSeldonItAction), this one ACTS via POST /api/copilot/turn against the
// hidden workspace_copilot agent (T2/T3) and shows the effect live in a
// side preview iframe. Mirrors HelpButton's self-contained floating pattern
// (fixed position, click-outside, Escape) but docks bottom-LEFT — HelpButton
// owns bottom-right.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type SeldonChatProps = {
  enabled: boolean;
  previewUrl: string | null;
  /** Simple-home (Task 7): when true, don't render the floating launcher
   *  bubble — the command bar opens the panel instead via the
   *  "seldonchat:open" event. Flag off ⇒ always false ⇒ bubble unchanged. */
  hideLauncher?: boolean;
};

type SeldonChatOpenDetail = {
  prefill?: string;
  chips?: string[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ToolEvent = { name: string; ok: boolean };

type TurnResponse =
  | { kind: "reply"; text: string; toolEvents: ToolEvent[] }
  | { kind: "capped"; used: number; limit: number; upgrade: string };

const EXAMPLE_PROMPTS = [
  "Change the headline to …",
  "Make the buttons match my logo",
  "Add a question to my intake form",
];

/** Rotating status phrases shown while a turn is pending (hotfix H3). Cycled
 *  every ~2.5s so a slow turn doesn't read as stuck. */
const PENDING_PHRASES = [
  "Reading your workspace…",
  "Planning the change…",
  "Applying it…",
  "Double-checking…",
  "Almost there…",
];

/** True when any tool call in this turn plausibly changed the workspace,
 *  so the live preview iframe should reload. Read-only tools (get_*, list_*)
 *  never match; the mutating verb prefixes cover every write tool the
 *  copilot capability exposes today. */
export function shouldBustPreview(toolEvents: { name: string }[]): boolean {
  return toolEvents.some((event) =>
    /^(edit_|update_|move_|delete_|add_|undo_)/.test(event.name),
  );
}

export function SeldonChat({ enabled, previewUrl, hideLauncher }: SeldonChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capped, setCapped] = useState<{ used: number; limit: number; upgrade: string } | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [pendingPhraseIndex, setPendingPhraseIndex] = useState(0);
  const [chips, setChips] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!enabled) return;

    function handleOpen(event: Event) {
      setOpen(true);
      const detail = (event as CustomEvent<SeldonChatOpenDetail | undefined>).detail;
      if (detail?.prefill) {
        // Prefill only — never auto-send. The operator reviews/edits before
        // hitting send, same as clicking one of the EXAMPLE_PROMPTS chips.
        setInput(detail.prefill);
      }
      if (detail?.chips) {
        setChips(detail.chips);
      }
    }

    window.addEventListener("seldonchat:open", handleOpen);
    return () => {
      window.removeEventListener("seldonchat:open", handleOpen);
    };
  }, [enabled]);

  // Hotfix H3 — cycle the pending status phrase every ~2.5s while a turn is
  // in flight; stop and reset to the first phrase as soon as it resolves.
  useEffect(() => {
    if (!pending) {
      setPendingPhraseIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setPendingPhraseIndex((current) => (current + 1) % PENDING_PHRASES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [pending]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    setError(null);
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: trimmed }]);
    setInput("");
    setPending(true);

    try {
      const response = await fetch("/api/copilot/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!response.ok) {
        setError("Something broke — try again");
        return;
      }

      const data = (await response.json()) as TurnResponse;

      if (data.kind === "capped") {
        setCapped({ used: data.used, limit: data.limit, upgrade: data.upgrade });
        return;
      }

      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: "assistant", content: data.text },
      ]);

      if (previewUrl && shouldBustPreview(data.toolEvents)) {
        setPreviewNonce(Date.now());
      }

      // F2 fix (2026-07-05, SH2-F2) — any successful tool call (mutating or
      // not — e.g. a successful enable_module also changes the nav) should
      // let LadderAutoRefresh pick up the DB state change via
      // router.refresh(), without this component needing to know anything
      // about the ladder.
      if (data.toolEvents.some((event) => event.ok)) {
        window.dispatchEvent(new CustomEvent("seldonchat:acted"));
      }
    } catch {
      setError("Something broke — try again");
    } finally {
      setPending(false);
    }
  }

  if (!enabled) {
    return null;
  }

  const showTwoPane = Boolean(previewUrl);

  return (
    <div ref={containerRef} className="fixed bottom-5 left-5 z-40 print:hidden">
      {open ? (
        <div
          className={`mb-3 flex overflow-hidden rounded-xl border border-border bg-popover shadow-xl ${
            showTwoPane ? "h-[560px] w-[calc(100vw-2.5rem)] max-w-4xl lg:w-[900px]" : "h-[520px] w-[calc(100vw-2.5rem)] max-w-md"
          }`}
        >
          <div className={`flex min-w-0 flex-col ${showTwoPane ? "w-full lg:w-[420px] lg:border-r lg:border-border" : "w-full"}`}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="size-4" />
                SeldonChat
              </p>
              <div className="flex items-center gap-2">
                {previewUrl ? (
                  <Link
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden text-xs text-muted-foreground hover:text-foreground lg:inline"
                  >
                    View site ↗
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close SeldonChat"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Tell SeldonChat what to change on your site, form, or CRM.
                  </div>
                  {chips.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {chips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => void sendMessage(chip)}
                          className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {EXAMPLE_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setInput(prompt)}
                          className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {message.content}
                </div>
              ))}

              {pending ? (
                <div aria-live="polite" className="text-xs text-muted-foreground">
                  {PENDING_PHRASES[pendingPhraseIndex]}
                </div>
              ) : null}

              {error ? (
                <div className="max-w-[90%] rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {capped ? (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  <p className="font-medium text-foreground">
                    You&apos;ve used today&apos;s {capped.limit} free SeldonChat edits
                  </p>
                  <Link
                    href={capped.upgrade}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4"
                  >
                    Go unlimited — $29/mo
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="border-t border-border p-3">
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage(input);
                }}
              >
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Tell SeldonChat what to change..."
                  className="min-h-[44px]"
                  disabled={pending || Boolean(capped)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (input.trim()) {
                        void sendMessage(input);
                      }
                    }
                  }}
                />
                <Button
                  type="submit"
                  disabled={pending || Boolean(capped) || input.trim().length === 0}
                >
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </form>
              {previewUrl ? (
                <Link
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground lg:hidden"
                >
                  View site ↗
                </Link>
              ) : null}
            </div>
          </div>

          {showTwoPane ? (
            <div className="hidden min-w-0 flex-1 lg:block">
              <iframe
                key={previewNonce}
                src={previewNonce ? `${previewUrl}?v=${previewNonce}` : previewUrl ?? undefined}
                title="Live workspace preview"
                className="h-full w-full border-0"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {hideLauncher ? null : (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? "Close SeldonChat" : "Open SeldonChat"}
          aria-expanded={open}
          className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <MessageCircle className="size-5" />
        </button>
      )}
    </div>
  );
}
