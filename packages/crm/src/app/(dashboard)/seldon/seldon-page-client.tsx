"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { CircleDashedIcon, MessageCircleDashedIcon, PaperclipIcon, SparklesIcon, WandSparklesIcon } from "lucide-react";
import {
  runSeldonItAction,
  saveSeldonBlockAction,
  type SeldonRunResult,
  type SeldonRunState,
  type SeldonSavedBlock,
  type SeldonSessionItem,
} from "@/lib/ai/seldon-actions";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const initialState: SeldonRunState = { ok: false };
const processingSteps = [
  "Analyzing your request...",
  "Reading your soul...",
  "Designing the block...",
  "Writing the code...",
  "Setting up connections...",
  "Almost there...",
];

function toOpenLabel(path: string) {
  if (path === "/forms") return "Open Forms";
  if (path === "/emails") return "Open Email";
  if (path === "/bookings") return "Open Booking";
  if (path === "/landing") return "Open Landing";
  return "Open Dashboard";
}

function toOpenEmoji(path: string) {
  if (path === "/forms") return "📋";
  if (path === "/emails") return "✉️";
  if (path === "/bookings") return "📅";
  if (path === "/landing") return "🌐";
  return "🧩";
}

function ResultCard({ result, onViewBlockMd, onRefine }: { result: SeldonRunResult; onViewBlockMd: (value: SeldonRunResult) => void; onRefine: (prompt: string) => void }) {
  const summaryLines = useMemo(
    () =>
      result.summary
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [result.summary]
  );

  const refineIdeas = [
    `Make ${result.blockName} more casual`,
    `Add a referral link in ${result.blockName}`,
  ];

  return (
    <article className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
      <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary px-6 py-5 space-y-4">
        <p className="text-sm leading-relaxed font-medium">✓ Created: {result.blockName}</p>
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">WHAT WAS CREATED</p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {summaryLines.length > 0
            ? summaryLines.map((line, idx) => <li key={idx}>• {line.replace(/^[-\s]*/, "")}</li>)
            : <li>• BLOCK.md generated successfully</li>}
        </ul>
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">NEXT STEPS</p>
          <ol className="space-y-1 text-sm text-muted-foreground">
            <li>1. Review → <Link href={result.openPath} className="text-primary underline underline-offset-4">Open {result.blockName}</Link></li>
            <li>2. Connect → <Link href="/settings/integrations" className="text-primary underline underline-offset-4">Connect integrations</Link></li>
            <li>3. Refine → type below to adjust</li>
          </ol>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">REFINE FURTHER</p>
          <div className="flex flex-wrap gap-2">
            {refineIdeas.map((idea) => (
              <button key={idea} type="button" className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent" onClick={() => onRefine(idea)}>
                {idea}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent" onClick={() => onViewBlockMd(result)}>
            View BLOCK.md
          </button>
          <form action={saveSeldonBlockAction}>
            <input type="hidden" name="blockId" value={result.blockId} />
            <input type="hidden" name="blockName" value={result.blockName} />
            <input type="hidden" name="blockMd" value={result.blockMd} />
            <button type="submit" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent">
              Save to My Blocks
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

function ConnectedFlowCard({ results, onViewBlockMd }: { results: SeldonRunResult[]; onViewBlockMd: (value: SeldonRunResult) => void }) {
  const flowName = results[0]?.blockName ?? "Connected Flow";

  return (
    <article className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
      <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary px-6 py-5 space-y-4">
        <p className="text-sm leading-relaxed font-medium">✓ Created: {flowName}</p>
        <p className="text-sm text-muted-foreground">{results.length} blocks created and connected:</p>
        <div className="space-y-4">
          {results.map((result, index) => (
            <div key={result.blockId} className="space-y-1">
              <p className="text-sm font-medium">
                {index + 1}. {toOpenEmoji(result.openPath)} {result.blockName}
              </p>
              <p className="text-xs text-muted-foreground">{result.summary.split("\n")[0]?.replace(/^[-\s]*/, "") || "Generated and connected."}</p>
              <div className="flex items-center gap-2">
                <Link href={result.openPath} className="text-xs text-primary underline underline-offset-4">
                  {toOpenLabel(result.openPath)}
                </Link>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-4"
                  onClick={() => onViewBlockMd(result)}
                >
                  View BLOCK.md
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Connected: Form → CRM → Email → Booking link</p>
      </div>
    </article>
  );
}

export function SeldonPageClient({
  allowed,
  sessions,
  savedBlocks,
  initialPrompt = "",
}: {
  allowed: boolean;
  sessions: SeldonSessionItem[];
  savedBlocks: SeldonSavedBlock[];
  initialPrompt?: string;
}) {
  const [state, action, pending] = useActionState(runSeldonItAction, initialState);
  const [selectedResult, setSelectedResult] = useState<SeldonRunResult | null>(null);
  const [description, setDescription] = useState(initialPrompt);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [processingIndex, setProcessingIndex] = useState(0);

  useEffect(() => {
    if (!pending) {
      return;
    }

    const timer = window.setInterval(() => {
      setProcessingIndex((current) => (current + 1) % processingSteps.length);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [pending]);

  const activeSession = useMemo(
    () => sessions.find((entry) => entry.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const activeSessionResults = useMemo(
    () => (activeSession?.messages ?? []).flatMap((message) => message.results ?? []),
    [activeSession],
  );

  const customizeExamples = [
    {
      icon: "📅",
      prompt: "Add a pre-call questionnaire to discovery calls",
    },
    {
      icon: "✉️",
      prompt: "Make my welcome email include my podcast link",
    },
    {
      icon: "📋",
      prompt: "Add branching logic to my intake form",
    },
    {
      icon: "🌐",
      prompt: "Add testimonials to my landing page",
    },
  ];

  const buildExamples = [
    { icon: "🎯", prompt: "Build a quiz funnel that qualifies leads" },
    { icon: "👤", prompt: "Create a client portal with session history" },
    { icon: "🎁", prompt: "Set up a referral program with tracking" },
    { icon: "💳", prompt: "Build a 3-installment payment plan via Stripe" },
    { icon: "📊", prompt: "Create a weekly pipeline report sent every Monday" },
  ];

  function fillPrompt(prompt: string) {
    setDescription(prompt);
    setTimeout(() => {
      const textarea = document.getElementById("seldon-description") as HTMLTextAreaElement | null;
      textarea?.focus();
    }, 50);
  }

  const hasHistoryState =
    pending ||
    Boolean(state.error) ||
    Boolean(state.message) ||
    Boolean(state.results?.length) ||
    chatMessages.length > 0 ||
    Boolean(activeSession);

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
                {sessions.length === 0 ? <p className="px-2 text-sm text-muted-foreground">No Seldon history yet.</p> : null}
                {sessions.map((item) => (
                  <div key={item.id} className="group/item relative flex items-center rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSessionId(item.id);
                        setChatMessages(
                          item.messages.map((message, index) => ({
                            id: `${item.id}-${index}`,
                            role: message.role,
                            content: message.content,
                          })),
                        );
                      }}
                      className="flex-1 justify-start gap-2 px-2 text-left h-auto py-1.5 min-w-0 pr-8 inline-flex items-center rounded-md text-sm font-medium hover:bg-accent"
                    >
                      <MessageCircleDashedIcon className="size-4 shrink-0" />
                      <span className="text-sm truncate min-w-0">{item.title}</span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <div className="px-2 py-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">My Blocks</p>
                </div>
                {savedBlocks.length === 0 ? <p className="px-2 text-sm text-muted-foreground">No saved blocks yet.</p> : null}
                {savedBlocks.map((item) => (
                  <div key={item.id} className="group/item relative flex items-center rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedResult({
                          blockId: item.id,
                          blockName: item.name,
                          blockMd: item.blockMd,
                          summary: "Saved block package",
                          fromInventory: false,
                          installMode: "instant",
                          openPath: "/seldon",
                          savePath: "/seldon",
                        });
                      }}
                      className="flex-1 justify-start gap-2 px-2 text-left h-auto py-1.5 min-w-0 pr-8 inline-flex items-center rounded-md text-sm font-medium hover:bg-accent"
                    >
                      <SparklesIcon className="size-4 shrink-0" />
                      <span className="text-sm truncate min-w-0">{item.name}</span>
                    </button>
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
                        <p className="text-base text-muted-foreground">Describe what you want to build or customize.</p>
                      </div>

                      <div className="space-y-5 mt-6 text-left">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Customize a block</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {customizeExamples.map((example) => (
                              <button
                                key={example.prompt}
                                type="button"
                                className="text-left rounded-xl border border-border p-3 hover:bg-accent/40 transition-colors"
                                onClick={() => fillPrompt(example.prompt)}
                              >
                                <p className="text-sm text-foreground">
                                  <span className="mr-1.5" aria-hidden="true">{example.icon}</span>
                                  &quot;{example.prompt}&quot;
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Build something new</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {buildExamples.map((example) => (
                              <button
                                key={example.prompt}
                                type="button"
                                className="text-left rounded-xl border border-border p-3 hover:bg-accent/40 transition-colors"
                                onClick={() => fillPrompt(example.prompt)}
                              >
                                <p className="text-sm text-foreground">
                                  <span className="mr-1.5" aria-hidden="true">{example.icon}</span>
                                  &quot;{example.prompt}&quot;
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>

                        <p className="text-xs text-center text-muted-foreground">Click any to start — or type your own.</p>
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
                    <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary px-6 py-4">
                      <p className="text-sm text-muted-foreground flex items-center gap-2 animate-pulse">
                        <span className="size-2 rounded-full bg-primary" />
                        {processingSteps[processingIndex]}
                      </p>
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
                    {state.results.length > 1 ? <ConnectedFlowCard results={state.results} onViewBlockMd={setSelectedResult} /> : null}
                    {state.results.map((result) => (
                      <ResultCard key={result.blockId} result={result} onViewBlockMd={setSelectedResult} onRefine={fillPrompt} />
                    ))}
                  </div>
                ) : null}

                {activeSessionResults.length > 0 ? (
                  <div className="space-y-3">
                    {activeSessionResults.map((result) => (
                      <ResultCard key={`session-${result.blockId}`} result={result} onViewBlockMd={setSelectedResult} onRefine={fillPrompt} />
                    ))}
                  </div>
                ) : null}

                {selectedResult ? (
                  <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[560px] border-l border-border bg-card px-6 py-5 shadow-xl">
                    <div className="flex h-full flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{selectedResult.blockName} BLOCK.md</p>
                        <div className="flex items-center gap-2">
                          <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent" onClick={async () => {
                            await navigator.clipboard.writeText(selectedResult.blockMd);
                          }}>
                            Copy
                          </button>
                          <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent" onClick={() => {
                            const blob = new Blob([selectedResult.blockMd], { type: "text/markdown;charset=utf-8" });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = `${selectedResult.blockName.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}.md`;
                            link.click();
                            URL.revokeObjectURL(url);
                          }}>
                            Download .md
                          </button>
                          <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent" onClick={() => setSelectedResult(null)}>
                            Close
                          </button>
                        </div>
                      </div>
                      <pre className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-secondary p-4 text-xs leading-relaxed whitespace-pre-wrap">
                        {selectedResult.blockMd}
                      </pre>
                    </div>
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
                  {[...customizeExamples, ...buildExamples].slice(0, 3).map((example) => (
                    <button
                      key={example.prompt}
                      type="button"
                      className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent"
                      onClick={() => fillPrompt(example.prompt)}
                    >
                      <WandSparklesIcon className="size-4" />
                      <span className="max-w-[220px] truncate">{example.prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
