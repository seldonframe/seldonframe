"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { BoxIcon, CircleDashedIcon, MessageCircleDashedIcon, PaperclipIcon, SparklesIcon, WandSparklesIcon } from "lucide-react";
import { disableSeldonBlockAction, runSeldonItAction, type SeldonHistoryItem, type SeldonRunResult, type SeldonRunState } from "@/lib/ai/seldon-actions";

type Services = {
  stripe: boolean;
  resend: boolean;
  twilio: boolean;
  kit: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const initialState: SeldonRunState = { ok: false };

function ResultCard({ result, onViewBlockMd }: { result: SeldonRunResult; onViewBlockMd: (value: SeldonRunResult) => void }) {
  const summaryLines = useMemo(
    () =>
      result.summary
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [result.summary]
  );

  return (
    <article className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
      <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary p-4 space-y-4">
        <p className="text-sm leading-relaxed">✓ Your &quot;{result.blockName}&quot; block is {result.installMode === "instant" ? "ready" : "queued for review"}.</p>
        <p className="text-sm text-muted-foreground">Here&apos;s what was created:</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
        {summaryLines.length > 0 ? summaryLines.map((line, idx) => <li key={idx}>• {line.replace(/^-\s*/, "")}</li>) : <li>• BLOCK.md generated successfully</li>}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={result.openPath} className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90">
            Open {result.blockName}
          </Link>
          <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent" onClick={() => onViewBlockMd(result)}>
            View BLOCK.md
          </button>
          <Link href={result.marketplaceSubmitPath} className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent">
            Sell on Marketplace
          </Link>
        </div>
      </div>
    </article>
  );
}

export function SeldonPageClient({ allowed, services, history }: { allowed: boolean; services: Services; history: SeldonHistoryItem[] }) {
  const [state, action, pending] = useActionState(runSeldonItAction, initialState);
  const [selectedResult, setSelectedResult] = useState<SeldonRunResult | null>(null);
  const [description, setDescription] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const hasHistoryState = pending || Boolean(state.error) || Boolean(state.message) || Boolean(state.results?.length);

  const assistantContent = state.error
    ? state.error
    : [
        state.message,
        ...(state.results ?? []).map((result) => `${result.blockName}: ${result.summary || "BLOCK.md generated successfully"}`),
      ]
        .filter(Boolean)
        .join("\n\n");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:block w-64 border-r border-border">
        <div className="flex h-full w-full flex-col bg-sidebar border-r border-sidebar-border">
          <div className="flex items-center justify-between p-3 border-b border-sidebar-border">
            <button type="button" className="w-full justify-start gap-2 px-2 h-10 inline-flex items-center rounded-md text-sm font-medium hover:bg-accent">
              <SparklesIcon className="size-4" />
              <span className="text-sm">New Session</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar">
            <div className="p-3 space-y-4">
              <div className="space-y-1">
                <div className="px-2 py-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent</p>
                </div>
                {history.length === 0 ? <p className="px-2 text-sm text-muted-foreground">No Seldon history yet.</p> : null}
                {history.map((item) => (
                  <div key={item.blockId} className="group/item relative flex items-center rounded-md overflow-hidden">
                    <Link href={item.openPath} className="flex-1 justify-start gap-2 px-2 text-left h-auto py-1.5 min-w-0 pr-8 inline-flex items-center rounded-md text-sm font-medium hover:bg-accent">
                      <MessageCircleDashedIcon className="size-4 shrink-0" />
                      <span className="text-sm truncate min-w-0">{item.blockName}</span>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden relative">
          <div className="relative z-10 h-full flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
              <div className="max-w-[640px] mx-auto space-y-6">
                {!hasHistoryState ? (
                  <div className="flex h-full flex-col items-center justify-center px-4 md:px-8">
                    <div className="w-full max-w-[640px] space-y-9 -mt-12">
                      <div className="flex justify-center">
                        <div className="flex items-center justify-center size-8 rounded-full">
                          <SparklesIcon className="size-20" />
                        </div>
                      </div>

                      <div className="space-y-4 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">Hey! I&apos;m Seldon</h1>
                        <p className="text-2xl text-foreground">Describe what you need</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {!allowed ? (
                  <div className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
                    <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary p-4 space-y-4">
                      <p className="text-sm leading-relaxed">Upgrade to Cloud Pro to Seldon custom blocks.</p>
                      <Link href="/settings/billing" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90">
                        Upgrade Plan
                      </Link>
                    </div>
                  </div>
                ) : null}

                {chatMessages.length > 0 ? (
                  <div className="space-y-3">
                    {chatMessages.map((message) => (
                      <div key={message.id} className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
                        <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary p-4 space-y-2">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{message.role === "user" ? "You" : "Seldon"}</p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {pending ? (
                  <div className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
                    <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary p-4">
                      <p className="text-sm text-muted-foreground">Processing...</p>
                    </div>
                  </div>
                ) : null}

                {!pending && assistantContent ? (
                  <div className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
                    <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary p-4 space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Seldon</p>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{assistantContent}</p>
                    </div>
                  </div>
                ) : null}

                {state.results?.length ? (
                  <div className="space-y-3">
                    {state.results.map((result) => (
                      <ResultCard key={result.blockId} result={result} onViewBlockMd={setSelectedResult} />
                    ))}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
                  <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary p-4 space-y-3">
                    <p className="text-sm text-muted-foreground">Connected services</p>
                    <p className="text-sm leading-relaxed">
                      Stripe: {services.stripe ? "connected" : "not connected"} · Resend: {services.resend ? "connected" : "not connected"} · Twilio: {services.twilio ? "connected" : "not connected"} · Kit: {services.kit ? "connected" : "not connected"}
                    </p>
                  </div>
                </div>

                {selectedResult ? (
                  <div className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
                    <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{selectedResult.blockName} BLOCK.md</p>
                        <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent" onClick={() => setSelectedResult(null)}>
                          Close
                        </button>
                      </div>
                      <textarea readOnly value={selectedResult.blockMd} className="min-h-[120px] resize-none border-0 bg-transparent px-4 py-3 text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 w-full" />
                    </div>
                  </div>
                ) : null}

                {history.length > 0 ? (
                  <div className="space-y-1">
                    <div className="px-2 py-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</p>
                    </div>
                    {history.map((item) => (
                      <div key={`${item.blockId}-actions`} className="flex items-center gap-2">
                        {item.status === "Active" ? (
                          <form action={disableSeldonBlockAction}>
                            <input type="hidden" name="blockId" value={item.blockId} />
                            <button type="submit" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent">
                              Disable {item.blockName}
                            </button>
                          </form>
                        ) : null}
                        <Link href={item.marketplaceSubmitPath} className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent">
                          Publish {item.blockName}
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-border px-4 md:px-8 py-[17px]">
              <div className="max-w-[640px] mx-auto">
                <form
                  action={action}
                  className="rounded-2xl border border-border bg-secondary dark:bg-card p-1"
                  onSubmit={() => {
                    const trimmed = description.trim();
                    if (!trimmed) {
                      return;
                    }

                    setChatMessages((current) => [
                      ...current,
                      {
                        id: `user-${Date.now()}`,
                        role: "user",
                        content: trimmed,
                      },
                    ]);
                  }}
                >
                  <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary">
                    <textarea
                      id="seldon-description"
                      name="description"
                      placeholder="Describe what you want to build..."
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      required
                      className="min-h-[120px] resize-none border-0 bg-transparent px-4 py-3 text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 w-full"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          if (description.trim()) {
                            event.currentTarget.form?.requestSubmit();
                          }
                        }
                      }}
                    />

                    <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="size-7 rounded-full border border-border dark:border-input bg-card dark:bg-secondary hover:bg-accent inline-flex items-center justify-center"
                        >
                          <PaperclipIcon className="size-4 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          className="gap-1.5 h-7 rounded-full border border-border dark:border-input bg-card dark:bg-secondary hover:bg-accent px-3 inline-flex items-center"
                        >
                          <CircleDashedIcon className="size-4 text-muted-foreground" />
                          <span className="hidden sm:inline text-sm text-muted-foreground/70">Deep Search</span>
                        </button>
                        <button
                          type="button"
                          className="gap-1.5 h-7 rounded-full border border-border dark:border-input bg-card dark:bg-secondary hover:bg-accent px-3 inline-flex items-center"
                        >
                          <SparklesIcon className="size-4 text-muted-foreground" />
                          <span className="hidden sm:inline text-sm text-muted-foreground/70">Think</span>
                        </button>
                      </div>

                      <button type="submit" disabled={pending || !allowed || description.trim().length === 0} className="h-7 px-4 gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                        {pending ? "Seldoning..." : "Send"}
                      </button>
                    </div>
                  </div>
                </form>

                <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                  <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent">
                    <WandSparklesIcon className="size-4" />
                    <span>Quick Block</span>
                  </button>
                  <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent">
                    <SparklesIcon className="size-4" />
                    <span>Full Feature</span>
                  </button>
                  <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent">
                    <BoxIcon className="size-4" />
                    <span>Integration</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
