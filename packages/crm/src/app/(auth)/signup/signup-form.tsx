"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { sendMagicLinkAction } from "./actions";
import { DEMO_BLOCK_MESSAGE } from "@/lib/demo/constants";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function SignupForm() {
  const { showDemoToast } = useDemoToast();
  const [state, action, pending] = useActionState(sendMagicLinkAction, {});

  useEffect(() => {
    if (state.error === DEMO_BLOCK_MESSAGE) {
      showDemoToast();
    }
  }, [showDemoToast, state.error]);

  return (
    <div className="space-y-5 text-foreground">
      <button
        type="button"
        className="crm-button-primary h-11 w-full px-4 text-base"
        onClick={() => signIn("google", { callbackUrl: "/" })}
      >
        Sign in with Google
      </button>

      <div className="relative flex items-center justify-center py-1">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[hsl(var(--border))]" />
        <span className="relative bg-[hsl(var(--card))] px-3 text-xs uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
          or
        </span>
      </div>

      <form action={action} className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="email" className="text-label text-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="crm-input h-10 w-full px-3"
          />
        </div>

        <button type="submit" disabled={pending} className="crm-button-secondary h-10 w-full px-4">
          {pending ? "Sending magic link..." : "Continue with email"}
        </button>
      </form>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      {state.sent && state.email ? (
        <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <p className="text-sm text-foreground">
            Magic link sent ✨ Check your inbox for <span className="font-medium">{state.email}</span>. Click the link to sign in.
          </p>
          {state.inboxUrl ? (
            <a
              href={state.inboxUrl}
              target="_blank"
              rel="noreferrer"
              className="crm-button-secondary inline-flex h-10 w-full items-center justify-center px-4"
            >
              Open Email Inbox
            </a>
          ) : (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Check your inbox.</p>
          )}
        </div>
      ) : null}

      <p className="text-center text-label text-[hsl(var(--color-text-secondary))]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
