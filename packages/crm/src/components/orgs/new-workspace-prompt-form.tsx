"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type CreateWorkspaceState = {
  error?: string;
  upgradeRequired?: boolean;
};

type NewWorkspacePromptFormProps = {
  action: (state: CreateWorkspaceState, formData: FormData) => Promise<CreateWorkspaceState>;
};

const initialState: CreateWorkspaceState = {};
const loadingMessages = [
  "Analyzing your description...",
  "Compiling your Soul...",
  "Building the core blocks...",
  "Wiring payments and automation...",
  "Activating Brain v2 intelligence...",
  "Deploying to Vercel...",
];
const examplePrompts = [
  "Build an AI video OS for ecommerce stores",
  "Create a coaching workspace for high-ticket client onboarding",
  "Set up a product launch OS for my indie SaaS",
];

function SubmitButton() {
  const { pending } = useFormStatus();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!pending) {
      return;
    }

    const interval = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 1800);

    return () => window.clearInterval(interval);
  }, [pending]);

  const messageIndex = pending ? tick % loadingMessages.length : 0;

  return (
    <Button type="submit" size="lg" className="h-11 px-5 text-sm sm:text-base min-w-64" disabled={pending}>
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" />
          <span>{loadingMessages[messageIndex]}</span>
        </span>
      ) : (
        "Generate my OS with Seldon"
      )}
    </Button>
  );
}

export function NewWorkspacePromptForm({ action }: NewWorkspacePromptFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const [description, setDescription] = useState("");

  if (state.upgradeRequired) {
    return (
      <div className="mx-auto max-w-xl space-y-6 text-center">
        <div className="space-y-3">
          <h2 className="text-section-title">You&apos;ve used your free workspace</h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            Each additional workspace is $9/month and unlocks more Brain intelligence for your OS.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/pricing" className="crm-button-primary h-11 px-5 inline-flex items-center justify-center">
            Upgrade to unlock more workspaces
          </Link>
          <Link href="/orgs" className="crm-button-secondary h-11 px-5 inline-flex items-center justify-center">
            Or use an existing workspace
          </Link>
        </div>

        {state.error ? <p className="text-sm text-muted-foreground">{state.error}</p> : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <Textarea
        name="description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Describe your business or paste a URL..."
        className="min-h-52 resize-y border-border/80 bg-background/60 px-4 py-3 text-sm shadow-(--shadow-xs) sm:text-base"
        required
      />

      <div className="flex flex-wrap gap-2">
        {examplePrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="rounded-full border border-border/80 bg-background/45 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-border hover:bg-accent hover:text-foreground"
            onClick={() => setDescription(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex flex-col items-center gap-3">
        <SubmitButton />
        <p className="max-w-2xl text-center text-sm text-muted-foreground">
          First workspace is free forever. Tell Seldon what you need and it will build your complete system.
        </p>
      </div>
    </form>
  );
}
