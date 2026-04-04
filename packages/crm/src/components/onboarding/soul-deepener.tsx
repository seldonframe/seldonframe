"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleDashedIcon, MessageCircleDashedIcon, PaperclipIcon, SparklesIcon, WandSparklesIcon } from "lucide-react";
import { completeSoulDeepenerAction, saveSoulDeepenerResponseAction, skipSoulDeepenerAction } from "@/lib/soul/actions";
import type { SoulDeepSetupResponse } from "@/lib/soul/types";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

/*
  Square UI class reference (source of truth):
  - templates/chat/components/chat/chat-conversation-view.tsx
    - messages shell: "flex-1 overflow-y-auto px-4 md:px-8 py-8"
    - thread width: "max-w-[640px] mx-auto space-y-6"
    - composer footer: "border-t border-border px-4 md:px-8 py-[17px]"
  - templates/chat/components/chat/chat-message.tsx
    - message row: "flex gap-4" + "justify-start/justify-end"
    - bubble: "rounded-2xl px-4 py-3 max-w-[80%]"
  - templates/chat/components/chat/chat-input-box.tsx
    - composer shell: "rounded-2xl border border-border bg-secondary ... p-1"
    - composer inner: "rounded-xl border ... bg-card"
*/

type DeepenerQuestion = {
  field: string;
  question: string;
  optional?: boolean;
};

const deepenerQuestions: DeepenerQuestion[] = [
  {
    field: "journey",
    question: "Walk me through what happens from the moment someone first reaches out to you. What are the main steps?",
  },
  {
    field: "timing_and_followups",
    question: "How quickly do you try to respond when someone reaches out? And what do you do if they go quiet?",
  },
  {
    field: "post_service",
    question: "What happens after you finish working with a client? Do you follow up, ask for reviews, or referrals?",
  },
  {
    field: "client_segments",
    question: "Do different types of clients need different things from you? For example, new clients vs long-term ones?",
    optional: true,
  },
  {
    field: "goals",
    question: "What does a great month look like for you? How many new clients and how much revenue?",
    optional: true,
  },
  {
    field: "services",
    question: "What services do you offer? Quick rundown — name, duration, and price.",
  },
];

type SoulDeepenerProps = {
  existingResponses?: SoulDeepSetupResponse[];
};

function getAnswerMap(responses: SoulDeepSetupResponse[]) {
  return responses.reduce<Record<string, SoulDeepSetupResponse>>((acc, item) => {
    acc[item.field] = item;
    return acc;
  }, {});
}

export function SoulDeepener({ existingResponses = [] }: SoulDeepenerProps) {
  const router = useRouter();
  const { showDemoToast } = useDemoToast();
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const [responses, setResponses] = useState<SoulDeepSetupResponse[]>(existingResponses);
  const [error, setError] = useState<string | null>(null);
  const [confirmingField, setConfirmingField] = useState<string | null>(null);

  const answerMap = useMemo(() => getAnswerMap(responses), [responses]);

  const nextQuestion = useMemo(() => {
    return deepenerQuestions.find((question) => !answerMap[question.field]) ?? null;
  }, [answerMap]);

  const answeredCount = responses.length;
  const totalCount = deepenerQuestions.length;
  const isFinished = !nextQuestion;
  const hasConversationState = responses.length > 0 || Boolean(confirmingField) || isFinished || Boolean(error);

  const automationSummary = useMemo(() => {
    return responses
      .filter((item) => item.response.trim().length > 0)
      .map((item) => {
        const question = deepenerQuestions.find((candidate) => candidate.field === item.field);
        return {
          field: item.field,
          title: question?.question ?? item.field,
          response: item.response,
        };
      });
  }, [responses]);

  function onSubmitResponse() {
    if (!nextQuestion || pending) {
      return;
    }

    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await saveSoulDeepenerResponseAction({
          response: trimmed,
        });

        const nextResponse: SoulDeepSetupResponse = {
          field: nextQuestion.field,
          question: nextQuestion.question,
          response: trimmed,
          answeredAt: new Date().toISOString(),
        };

        setResponses((current) => {
          const withoutCurrent = current.filter((item) => item.field !== nextQuestion.field);
          return [...withoutCurrent, nextResponse];
        });
        setConfirmingField(nextQuestion.field);
        setInput("");
      } catch (cause) {
        if (isDemoBlockedError(cause)) {
          showDemoToast();
          return;
        }

        setError("Unable to save your response. Please try again.");
      }
    });
  }

  function onAdjustLastResponse() {
    if (!confirmingField) {
      return;
    }

    const existing = responses.find((item) => item.field === confirmingField);

    if (existing) {
      setInput(existing.response);
    }

    setResponses((current) => current.filter((item) => item.field !== confirmingField));
    setConfirmingField(null);
  }

  function onLooksGood() {
    setConfirmingField(null);
  }

  function onSkip() {
    if (pending) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await skipSoulDeepenerAction();
        router.push("/dashboard");
      } catch (cause) {
        if (isDemoBlockedError(cause)) {
          showDemoToast();
          return;
        }

        setError("Unable to skip right now. Please try again.");
      }
    });
  }

  function onFinish() {
    if (pending) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await completeSoulDeepenerAction();
        router.push("/dashboard?deepSetup=1");
      } catch (cause) {
        if (isDemoBlockedError(cause)) {
          showDemoToast();
          return;
        }

        setError("Unable to complete setup right now. Please try again.");
      }
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background rounded-2xl border border-border">
      <div className="flex-1 overflow-hidden relative">
        <div className="relative z-10 h-full flex flex-col">
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
            <div className="max-w-[640px] mx-auto space-y-6">
              {!hasConversationState ? (
                <div className="flex h-full flex-col items-center justify-center px-4 md:px-8">
                  <div className="w-full max-w-[640px] space-y-9 -mt-12">
                    <div className="flex justify-center">
                      <div className="flex items-center justify-center size-8 rounded-full">
                        <SparklesIcon className="size-20" />
                      </div>
                    </div>

                    <div className="space-y-4 text-center">
                      <h1 className="text-2xl font-semibold tracking-tight">Hey! I&apos;m Seldon</h1>
                      <p className="text-2xl text-foreground">Let&apos;s deepen your soul setup</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
                <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Soul Deep Setup</p>
                      <p className="text-xs text-muted-foreground">Set up automations in a conversation</p>
                    </div>
                    <button
                      type="button"
                      className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 py-1.5 border border-input bg-background hover:bg-accent"
                      onClick={onSkip}
                      disabled={pending}
                    >
                      Skip for now
                    </button>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(Math.min(answeredCount, totalCount) / totalCount) * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.min(answeredCount, totalCount)}/{totalCount} answered
                  </p>
                </div>
              </div>

              <div className="flex gap-4 justify-start">
                <div className="shrink-0">
                  <div className="size-8 rounded-full bg-secondary flex items-center justify-center">
                    <SparklesIcon className="size-5" />
                  </div>
                </div>
                <div className="rounded-2xl px-4 py-3 max-w-[80%] bg-secondary">
                  <p className="text-sm leading-relaxed">Your business is set up. Want to unlock automations? Tell me how your client journey works and I&apos;ll handle the rest.</p>
                </div>
              </div>

              {responses.map((item) => {
                const question = deepenerQuestions.find((candidate) => candidate.field === item.field);
                return (
                  <div key={item.field} className="space-y-4">
                    <div className="flex gap-4 justify-start">
                      <div className="shrink-0">
                        <div className="size-8 rounded-full bg-secondary flex items-center justify-center">
                          <SparklesIcon className="size-5" />
                        </div>
                      </div>
                      <div className="rounded-2xl px-4 py-3 max-w-[80%] bg-secondary">
                        <p className="text-sm leading-relaxed">{question?.question ?? item.question}</p>
                      </div>
                    </div>
                    <div className="flex gap-4 justify-end">
                      <div className="rounded-2xl px-4 py-3 max-w-[80%] bg-primary text-primary-foreground">
                        <p className="text-sm leading-relaxed">{item.response}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {confirmingField ? (
                <div className="flex gap-4 justify-start">
                  <div className="shrink-0">
                    <div className="size-8 rounded-full bg-secondary flex items-center justify-center">
                      <SparklesIcon className="size-5" />
                    </div>
                  </div>
                  <div className="rounded-2xl px-4 py-3 max-w-[80%] bg-secondary space-y-3">
                    <p className="text-sm leading-relaxed">Here&apos;s what I understood from that answer. Does this look right?</p>
                    <div className="flex items-center gap-2">
                      <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={onLooksGood} disabled={pending}>
                        Looks good
                      </button>
                      <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 py-1.5 border border-input bg-background hover:bg-accent" onClick={onAdjustLastResponse} disabled={pending}>
                        Let me adjust
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {!confirmingField && nextQuestion ? (
                <div className="flex gap-4 justify-start">
                  <div className="shrink-0">
                    <div className="size-8 rounded-full bg-secondary flex items-center justify-center">
                      <SparklesIcon className="size-5" />
                    </div>
                  </div>
                  <div className="rounded-2xl px-4 py-3 max-w-[80%] bg-secondary">
                    <p className="text-sm leading-relaxed">
                      {nextQuestion.question}
                      {nextQuestion.optional ? <span className="ml-1.5 text-xs text-muted-foreground">(optional)</span> : null}
                    </p>
                  </div>
                </div>
              ) : null}

              {isFinished ? (
                <div className="space-y-4">
                  <div className="flex gap-4 justify-start">
                    <div className="shrink-0">
                      <div className="size-8 rounded-full bg-secondary flex items-center justify-center">
                        <SparklesIcon className="size-5" />
                      </div>
                    </div>
                    <div className="rounded-2xl px-4 py-3 max-w-[80%] bg-secondary space-y-3">
                      <p className="text-sm font-medium leading-relaxed">Your automations are configured</p>
                      <p className="text-xs text-muted-foreground">Here&apos;s what will happen automatically:</p>
                    </div>
                  </div>
                  <div className="ml-12 space-y-2">
                    {automationSummary.map((item) => (
                      <div key={item.field} className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
                        <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary p-3 text-sm text-foreground">{item.response}</div>
                      </div>
                    ))}
                  </div>
                  <div className="ml-12">
                    <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={onFinish} disabled={pending}>
                      {pending ? "Finishing..." : "Finish deep setup"}
                    </button>
                  </div>
                </div>
              ) : null}

              {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
            </div>
          </div>

          {!confirmingField && nextQuestion ? (
            <div className="border-t border-border px-4 md:px-8 py-[17px]">
              <div className="max-w-[640px] mx-auto">
                <div className="rounded-2xl border border-border bg-secondary dark:bg-card p-1">
                  <div className="rounded-xl border border-border dark:border-transparent bg-card dark:bg-secondary">
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          onSubmitResponse();
                        }
                      }}
                      placeholder="Type your answer..."
                      disabled={pending}
                      className="min-h-[120px] resize-none border-0 bg-transparent px-4 py-3 text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 w-full"
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
                          <span className="hidden sm:inline text-sm text-muted-foreground/70">Deep Setup</span>
                        </button>
                        <button
                          type="button"
                          className="gap-1.5 h-7 rounded-full border border-border dark:border-input bg-card dark:bg-secondary hover:bg-accent px-3 inline-flex items-center"
                        >
                          <SparklesIcon className="size-4 text-muted-foreground" />
                          <span className="hidden sm:inline text-sm text-muted-foreground/70">Reflect</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={onSubmitResponse}
                        disabled={pending || input.trim().length === 0}
                        className="h-7 px-4 gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {pending ? "Saving..." : "Send"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                  <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent">
                    <MessageCircleDashedIcon className="size-4" />
                    <span>Client Journey</span>
                  </button>
                  <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent">
                    <WandSparklesIcon className="size-4" />
                    <span>Follow-ups</span>
                  </button>
                  <button type="button" className="gap-2 inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent">
                    <SparklesIcon className="size-4" />
                    <span>Services</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
