"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { MessageCircle, Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { runSeldonItAction, type SeldonRunState } from "@/lib/ai/seldon-actions";
import { recordSeldonFeedbackAction } from "@/lib/ai/record-seldon-feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type SeldonChatProps = {
  enabled: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const initialState: SeldonRunState = { ok: false };

export function SeldonChat({ enabled }: SeldonChatProps) {
  const [state, action, pending] = useActionState(runSeldonItAction, initialState);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, -1 | 1>>({});
  const visibleError = state.error?.includes("Failed to parse Seldon response") ? undefined : state.error;

  async function submitFeedback(feedbackScore: -1 | 1, messageId: string) {
    if (feedbackByMessage[messageId]) {
      return;
    }

    const payload = new FormData();
    payload.set("feedbackScore", String(feedbackScore));
    payload.set("sessionId", state.sessionId ?? "");
    payload.set("messageId", messageId);

    const result = await recordSeldonFeedbackAction(payload);
    if (result.ok) {
      setFeedbackByMessage((current) => ({
        ...current,
        [messageId]: feedbackScore,
      }));
    }
  }

  useEffect(() => {
    function handleOpen() {
      if (!enabled) {
        return;
      }

      setOpen(true);
    }

    window.addEventListener("crm:builder-seldon-open", handleOpen);
    return () => {
      window.removeEventListener("crm:builder-seldon-open", handleOpen);
    };
  }, [enabled]);

  function submitCurrentPrompt() {
    const trimmed = description.trim();
    if (!trimmed || pending || !enabled) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      },
    ]);
  }

  if (!enabled) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full max-w-2xl p-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Seldon Builder Chat
          </SheetTitle>
          <SheetDescription>
            Claude-like workspace chat for builder-mode customization.
          </SheetDescription>
        </SheetHeader>

        <div className="flex h-full min-h-0 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p>Describe changes like:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Add a lead magnet landing page and follow-up email sequence.</li>
                  <li>Create a client onboarding workflow with reminders.</li>
                  <li>Customize labels and pipeline stages for my agency.</li>
                </ul>
              </div>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                {message.content}
              </div>
            ))}

            {pending ? <div className="text-xs text-muted-foreground">Seldon is designing your changes...</div> : null}

            {!pending && (visibleError || state.message) ? (
              <div className="max-w-[90%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground space-y-2">
                <div>{visibleError ?? state.message}</div>
                {state.message ? (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      aria-label="Thumbs up"
                      onClick={() => void submitFeedback(1, `builder-sheet-${state.sessionId ?? "latest"}`)}
                      disabled={Boolean(feedbackByMessage[`builder-sheet-${state.sessionId ?? "latest"}`])}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="h-7 w-7"
                      aria-label="Thumbs down"
                      onClick={() => void submitFeedback(-1, `builder-sheet-${state.sessionId ?? "latest"}`)}
                      disabled={Boolean(feedbackByMessage[`builder-sheet-${state.sessionId ?? "latest"}`])}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="border-t border-border p-4">
            <form
              action={action}
              className="space-y-2"
              onSubmit={() => {
                submitCurrentPrompt();
                setDescription("");
              }}
            >
              <input type="hidden" name="sessionId" value={state.sessionId ?? ""} />
              <input type="hidden" name="builder_mode" value="true" />
              <Textarea
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Tell Seldon what to build or improve..."
                className="min-h-[112px]"
                required
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (description.trim()) {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <Link href="/seldon" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Open full Seldon workspace
                </Link>
                <Button type="submit" disabled={pending || description.trim().length === 0}>
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </div>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
