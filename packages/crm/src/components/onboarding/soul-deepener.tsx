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
    <section className="mx-auto w-full max-w-4xl space-y-4">
      <article className="glass-card rounded-2xl p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Soul Deep Setup</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Set up automations in a conversation</h1>
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {Math.min(answeredCount, totalCount)} of {totalCount} questions answered
          </p>
        </div>

        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted)/0.5)]">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(Math.min(answeredCount, totalCount) / totalCount) * 100}%` }} />
        </div>

        <div className="space-y-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">SF</div>
            <div className="max-w-[85%] rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-foreground">
              Your business is set up. Want to unlock automations? Tell me how your client journey works and I&apos;ll handle the rest.
            </div>
          </div>

          {responses.map((item) => {
            const question = deepenerQuestions.find((candidate) => candidate.field === item.field);
            return (
              <div key={item.field} className="space-y-2">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">SF</div>
                  <div className="max-w-[85%] rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-foreground">{question?.question ?? item.question}</div>
                </div>
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-foreground">{item.response}</div>
                </div>
              </div>
            );
          })}

          {confirmingField ? (
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
              <p className="text-sm text-foreground">Here&apos;s what I understood from that answer. Does this look right?</p>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" className="crm-button-primary h-9 px-3 text-sm" onClick={onLooksGood} disabled={pending}>
                  Looks good
                </button>
                <button type="button" className="crm-button-secondary h-9 px-3 text-sm" onClick={onAdjustLastResponse} disabled={pending}>
                  Let me adjust
                </button>
              </div>
            </div>
          ) : null}

          {!confirmingField && nextQuestion ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">SF</div>
                <div className="max-w-[85%] rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-foreground">
                  {nextQuestion.question}
                  {nextQuestion.optional ? <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">(optional)</span> : null}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  className="crm-input h-11 flex-1 px-3"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Type your answer"
                  disabled={pending}
                />
                <button type="button" className="crm-button-primary h-11 px-4" onClick={onSubmitResponse} disabled={pending || input.trim().length === 0}>
                  {pending ? "Saving..." : "Send"}
                </button>
              </div>
            </div>
          ) : null}

          {isFinished ? (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
              <h2 className="text-base font-semibold text-foreground">Your automations are configured</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Here&apos;s what will happen automatically:</p>
              <ul className="space-y-2">
                {automationSummary.map((item) => (
                  <li key={item.field} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-foreground">
                    {item.response}
                  </li>
                ))}
              </ul>
              <button type="button" className="crm-button-primary h-10 px-4" onClick={onFinish} disabled={pending}>
                {pending ? "Finishing..." : "Finish deep setup"}
              </button>
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

        <div className="mt-6 flex justify-end">
          <button type="button" className="crm-button-secondary h-10 px-4" onClick={onSkip} disabled={pending}>
            I&apos;ll do this later
          </button>
        </div>
      </article>
    </section>
  );
}
