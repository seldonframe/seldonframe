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
import { upload } from "@vercel/blob/client";
import { MessageCircle, Paperclip, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMarkdown } from "@/components/chat-markdown";

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

/** A clickable design chip surfaced from a `list_designs` tool call this
 *  turn (see design-chips.ts). Rendered as a tap-to-apply button instead
 *  of letting the model verbalize the raw tool result as a markdown table. */
type DesignChip = {
  id: string;
  label: string;
  swatch: string | null;
  applyText: string;
  applyPayload: string;
};

type DesignOptions = { isHealth: boolean; chips: DesignChip[] };

/** A stock photo surfaced from a `search_media` tool call this turn (see
 *  api/copilot/turn/route.ts). Rendered as a tappable thumbnail; tapping
 *  sends a deterministic apply payload naming the exact slot + URL so the
 *  model calls update_media with no ambiguity. */
type MediaPhoto = { url: string; thumbUrl: string; alt: string; credit: string; source: string };
type MediaOptions = { slot: string; photos: MediaPhoto[] };

/** T4 — a file the operator attached/dropped into the chat, uploaded to
 *  Blob and awaiting send. Cleared once the message threading it in is
 *  sent (the copilot applies it via update_media→resolveExternalMedia,
 *  the same SSRF-gated apply path every other media source uses). */
type PendingAttachment = { url: string; name: string; kind: "image" | "video" };

type AttachState =
  | { status: "idle" }
  | { status: "uploading"; name: string }
  | { status: "error"; message: string };

const ATTACH_ACCEPT = "image/*,video/mp4,video/webm";

type TurnResponse =
  | {
      kind: "reply";
      text: string;
      toolEvents: ToolEvent[];
      designOptions?: DesignOptions;
      mediaOptions?: MediaOptions;
    }
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
  const [designOptions, setDesignOptions] = useState<DesignChip[]>([]);
  const [mediaOptions, setMediaOptions] = useState<MediaOptions | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attachState, setAttachState] = useState<AttachState>({ status: "idle" });
  const [isDraggingFile, setDraggingFile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /** T4 — upload an attached/dropped file to Blob via the media upload
   *  token route, then store it as a pending attachment chip. The actual
   *  "apply to the site" happens on send (sendMessage folds the uploaded
   *  URL into the message text so the copilot calls update_media). */
  async function handleFile(file: File) {
    const kind: PendingAttachment["kind"] = file.type.startsWith("video/") ? "video" : "image";
    setAttachState({ status: "uploading", name: file.name });

    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
      const pathname = `seldonchat/${crypto.randomUUID()}-${safeName}`;

      const result = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/v1/workspace/media/upload",
        contentType: file.type,
        clientPayload: JSON.stringify({ contentType: file.type }),
      });

      setPendingAttachment({ url: result.url, name: file.name, kind });
      setAttachState({ status: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setAttachState({
        status: "error",
        message: humanizeAttachError(message),
      });
    }
  }

  async function sendMessage(payload: string, displayText?: string) {
    const attachment = pendingAttachment;
    const userText = payload.trim();
    if ((!userText && !attachment) || pending) return;

    const trimmed = attachment
      ? `${userText || "Use this uploaded file"} — uploaded ${attachment.kind} URL: ${attachment.url}`
      : userText;
    const shownText = attachment
      ? `${displayText ?? userText ?? ""}${userText || displayText ? " " : ""}📎 ${attachment.name}`.trim()
      : (displayText ?? payload).trim() || trimmed;

    if (!trimmed) return;

    setError(null);
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: shownText },
    ]);
    setInput("");
    setPendingAttachment(null);
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

      // Design picker chips: show a fresh set when list_designs ran this
      // turn, clear it once the operator's pick actually applied (a
      // successful update_design), otherwise leave whatever's showing.
      if (data.designOptions?.chips?.length) {
        setDesignOptions(data.designOptions.chips);
      } else if (data.toolEvents.some((event) => event.name === "update_design" && event.ok)) {
        setDesignOptions([]);
      }

      // Media picker thumbnails: show a fresh set when search_media ran this
      // turn, clear it once a pick actually applied (a successful
      // update_media) or the media was removed (a successful delete_media),
      // otherwise leave whatever's showing.
      if (data.mediaOptions?.photos?.length) {
        setMediaOptions(data.mediaOptions);
      } else if (
        data.toolEvents.some(
          (event) => (event.name === "update_media" || event.name === "delete_media") && event.ok,
        )
      ) {
        setMediaOptions(null);
      }

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
          <div
            className={`relative flex min-w-0 flex-col ${showTwoPane ? "w-full lg:w-[420px] lg:border-r lg:border-border" : "w-full"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDraggingFile(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDraggingFile(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDraggingFile(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            {isDraggingFile ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-popover/90 text-sm font-medium text-foreground">
                Drop a photo or video to attach
              </div>
            ) : null}
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
                  {message.role === "assistant" ? (
                    <ChatMarkdown content={message.content} />
                  ) : (
                    message.content
                  )}
                </div>
              ))}

              {pending ? (
                <div aria-live="polite" className="text-xs text-muted-foreground">
                  {PENDING_PHRASES[pendingPhraseIndex]}
                </div>
              ) : null}

              {designOptions.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Pick a look — tap to preview it live
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {designOptions.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        disabled={pending}
                        onClick={() => void sendMessage(chip.applyPayload, chip.applyText)}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {chip.swatch ? (
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: chip.swatch }}
                          />
                        ) : null}
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {mediaOptions && mediaOptions.photos.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Tap a photo to use it
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {mediaOptions.photos.map((photo) => (
                      <button
                        key={photo.url}
                        type="button"
                        disabled={pending}
                        title={`${photo.source}${photo.credit ? ` — ${photo.credit}` : ""}`}
                        onClick={() =>
                          void sendMessage(
                            `Set the ${mediaOptions.slot} to this image: ${photo.url} (alt text: "${photo.alt}")`,
                            "Applying photo…",
                          )
                        }
                        className="size-[72px] shrink-0 overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- external stock-photo thumbnail, not a local/optimizable asset */}
                        <img
                          src={photo.thumbUrl}
                          alt={photo.alt}
                          className="size-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="max-w-[90%] rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {attachState.status === "error" ? (
                <div className="max-w-[90%] rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {attachState.message}
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
              {pendingAttachment ? (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground">
                    <span className="truncate">📎 {pendingAttachment.name}</span>
                    <button
                      type="button"
                      onClick={() => setPendingAttachment(null)}
                      aria-label="Remove attachment"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                </div>
              ) : null}
              {attachState.status === "uploading" ? (
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  Uploading {attachState.name}…
                </div>
              ) : null}
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage(input);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ATTACH_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending || Boolean(capped) || attachState.status === "uploading"}
                  aria-label="Attach a photo or video"
                  title="Attach a photo or video"
                  className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Paperclip className="size-4" />
                </button>
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Tell SeldonChat what to change..."
                  className="min-h-[44px]"
                  disabled={pending || Boolean(capped)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (input.trim() || pendingAttachment) {
                        void sendMessage(input);
                      }
                    }
                  }}
                />
                <Button
                  type="submit"
                  disabled={
                    pending ||
                    Boolean(capped) ||
                    (input.trim().length === 0 && !pendingAttachment)
                  }
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

/** T4 — turn a raw upload-token/Blob error into operator-friendly copy. */
function humanizeAttachError(message: string): string {
  if (message.includes("content_type_not_allowed")) {
    return "That file type isn't supported — attach an image (PNG/JPEG/WEBP/GIF/SVG) or a video (MP4/WEBM).";
  }
  if (message.includes("Unauthorized") || message.includes("unauthorized")) {
    return "You need to be signed in to attach files.";
  }
  if (message.toLowerCase().includes("exceeds") || message.toLowerCase().includes("too large")) {
    return "That file is too large — images up to 5 MB, videos up to 50 MB.";
  }
  return "Upload failed. Please try again.";
}
