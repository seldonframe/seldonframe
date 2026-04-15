"use client";

import { useActionState, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { runSeldonItAction, type SeldonRunState } from "@/lib/ai/seldon-actions";
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
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Ask Seldon"
      >
        <MessageCircle className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full max-w-md p-0">
          <SheetHeader className="border-b border-border">
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
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Ask for changes like &quot;Show me only evening slots&quot; or &quot;Add a custom report for my account&quot;.
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

              {pending ? <div className="text-xs text-muted-foreground">Seldon is thinking...</div> : null}

              {!pending && (state.error || state.message) ? (
                <div className="max-w-[90%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                  {state.error ?? state.message}
                </div>
              ) : null}
            </div>

            <div className="border-t border-border p-3">
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
                  className="min-h-[88px]"
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
