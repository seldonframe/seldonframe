"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeSoulDeepenerAction, saveSoulDeepenerResponseAction, skipSoulDeepenerAction } from "@/lib/soul/actions";
import type { SoulDeepSetupResponse } from "@/lib/soul/types";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

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
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Soul Deep Setup</h1>
            <p className="text-xs text-muted-foreground">Set up automations in a conversation</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(Math.min(answeredCount, totalCount) / totalCount) * 100}%` }} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{Math.min(answeredCount, totalCount)}/{totalCount}</span>
            </div>
            <button type="button" className="crm-button-secondary h-8 px-3 text-xs" onClick={onSkip} disabled={pending}>
              Skip for now
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              <div className="flex gap-4 justify-start">
                <div className="shrink-0">
                  <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-primary">SF</div>
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
                        <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-primary">SF</div>
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
                    <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-primary">SF</div>
                  </div>
                  <div className="rounded-2xl px-4 py-3 max-w-[80%] bg-secondary space-y-3">
                    <p className="text-sm leading-relaxed">Here&apos;s what I understood from that answer. Does this look right?</p>
                    <div className="flex items-center gap-2">
                      <button type="button" className="crm-button-primary h-8 px-3 text-xs" onClick={onLooksGood} disabled={pending}>
                        Looks good
                      </button>
                      <button type="button" className="crm-button-secondary h-8 px-3 text-xs" onClick={onAdjustLastResponse} disabled={pending}>
                        Let me adjust
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {!confirmingField && nextQuestion ? (
                <div className="flex gap-4 justify-start">
                  <div className="shrink-0">
                    <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-primary">SF</div>
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
                      <div className="size-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-primary">SF</div>
                    </div>
                    <div className="rounded-2xl px-4 py-3 max-w-[80%] bg-secondary space-y-3">
                      <p className="text-sm font-medium leading-relaxed">Your automations are configured</p>
                      <p className="text-xs text-muted-foreground">Here&apos;s what will happen automatically:</p>
                    </div>
                  </div>
                  <div className="ml-12 space-y-2">
                    {automationSummary.map((item) => (
                      <div key={item.field} className="rounded-xl border bg-card p-3 text-sm text-foreground">
                        {item.response}
                      </div>
                    ))}
                  </div>
                  <div className="ml-12">
                    <button type="button" className="crm-button-primary h-9 px-5" onClick={onFinish} disabled={pending}>
                      {pending ? "Finishing..." : "Finish deep setup"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {!confirmingField && nextQuestion ? (
            <div className="border-t border-border px-6 py-4">
              <div className="rounded-2xl border border-border bg-secondary p-1">
                <div className="rounded-xl border border-transparent bg-card">
                  <input
                    className="crm-input h-10 w-full border-0 bg-transparent px-4 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-0"
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
                  />
                  <div className="flex items-center justify-end px-4 py-2 border-t border-border/50">
                    <button
                      type="button"
                      className="crm-button-primary h-7 px-4 text-xs"
                      onClick={onSubmitResponse}
                      disabled={pending || input.trim().length === 0}
                    >
                      {pending ? "Saving..." : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {error ? <p className="px-6 pb-4 text-sm text-red-500">{error}</p> : null}
      </div>
    </section>
  );
}
