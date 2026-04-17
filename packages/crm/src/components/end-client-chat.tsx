"use client";

import { useActionState, useState } from "react";
import { MessageCircle, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { runSeldonItAction, type SeldonRunState } from "@/lib/ai/seldon-actions";
import { recordSeldonFeedbackAction } from "@/lib/ai/record-seldon-feedback";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

type EndClientChatProps = {
  orgSlug: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const initialState: SeldonRunState = { ok: false };

export function EndClientChat({ orgSlug }: EndClientChatProps) {
  const [state, action, pending] = useActionState(runSeldonItAction, initialState);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, -1 | 1>>({});

  async function submitFeedback(feedbackScore: -1 | 1, messageId: string) {
    if (feedbackByMessage[messageId]) {
      return;
    }

    const payload = new FormData();
    payload.set("feedbackScore", String(feedbackScore));
    payload.set("sessionId", state.sessionId ?? "");
    payload.set("messageId", messageId);
    payload.set("end_client_mode", "true");
    payload.set("orgSlug", orgSlug);

    const result = await recordSeldonFeedbackAction(payload);
    if (result.ok) {
      setFeedbackByMessage((current) => ({
        ...current,
        [messageId]: feedbackScore,
      }));
    }
  }

  function submitCurrentPrompt() {
    const trimmed = description.trim();
    if (!trimmed || pending) {
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

  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full border border-border/80 bg-card/92 text-foreground shadow-(--shadow-card) hover:-translate-y-0.5 hover:bg-card"
        onClick={() => setOpen(true)}
        aria-label="Ask Seldon"
      >
        <MessageCircle className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full max-w-md border-l border-border/80 bg-background/96 p-0 backdrop-blur-xl">
          <SheetHeader className="border-b border-border/80 bg-card/80 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle>Ask Seldon</SheetTitle>
                <SheetDescription>Client-scoped customization assistant</SheetDescription>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-border/80 bg-card/70 p-4 text-sm text-muted-foreground shadow-(--shadow-xs)">
                  Ask for changes like &quot;Show me only evening slots&quot; or &quot;Add a custom report for my account&quot;.
                </div>
              ) : null}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow-(--shadow-xs) ${
                    message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "border border-border/80 bg-card/80 text-foreground"
                  }`}
                >
                  {message.content}
                </div>
              ))}

              {pending ? <div className="text-xs text-muted-foreground">Seldon is thinking...</div> : null}

              {!pending && (state.error || state.message) ? (
                <div className="max-w-[90%] space-y-2 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm text-foreground shadow-(--shadow-xs)">
                  <div>{state.error ?? state.message}</div>
                  {state.message ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        aria-label="Thumbs up"
                        onClick={() => void submitFeedback(1, `end-client-${state.sessionId ?? "latest"}`)}
                        disabled={Boolean(feedbackByMessage[`end-client-${state.sessionId ?? "latest"}`])}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        aria-label="Thumbs down"
                        onClick={() => void submitFeedback(-1, `end-client-${state.sessionId ?? "latest"}`)}
                        disabled={Boolean(feedbackByMessage[`end-client-${state.sessionId ?? "latest"}`])}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="border-t border-border/80 bg-card/70 p-4">
              <form
                action={action}
                className="space-y-2"
                onSubmit={() => {
                  submitCurrentPrompt();
                  setDescription("");
                }}
              >
                <input type="hidden" name="sessionId" value={state.sessionId ?? ""} />
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <input type="hidden" name="end_client_mode" value="true" />
                <Textarea
                  name="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Tell Seldon what to customize for you..."
                  className="min-h-[88px] border-border/80 bg-background/60 shadow-(--shadow-xs)"
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
                <div className="flex justify-end">
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
    </>
  );
}
