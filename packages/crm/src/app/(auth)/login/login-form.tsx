"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { sendMagicLinkAction } from "./actions";
import { DEMO_BLOCK_MESSAGE } from "@/lib/demo/constants";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function LoginForm({ redirectTo }: { redirectTo?: string | null }) {
  const { showDemoToast } = useDemoToast();
  const [state, action, pending] = useActionState(sendMagicLinkAction, {});

  useEffect(() => {
    if (state.error === DEMO_BLOCK_MESSAGE) {
      showDemoToast();
    }
  }, [showDemoToast, state.error]);

  // When present (marketplace buy intent), carry the safe relative path into the
  // magic-link action's `redirectTo` so post-login the buyer returns to the
  // agent listing they were buying instead of the default /clients/new. The
  // page already validated/relativized it via toInternalRedirectPath.
  const signupHref = redirectTo
    ? `/signup?callbackUrl=${encodeURIComponent(redirectTo)}`
    : "/signup";

  return (
    <div className="space-y-5 text-foreground">
      <form action={action} className="space-y-3">
        {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
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

        <button type="submit" disabled={pending} className="crm-button-primary h-10 w-full px-4">
          {pending ? "Sending magic link..." : "Continue with email"}
        </button>
      </form>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      {state.sent && state.email ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
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
            <p className="text-xs text-muted-foreground">Check your inbox.</p>
          )}
        </div>
      ) : null}

      <p className="text-center text-label text-[hsl(var(--color-text-secondary))]">
        New here? <Link href={signupHref} className="font-medium text-primary underline underline-offset-4">Start for free →</Link>
      </p>
    </div>
  );
}
