"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { sendMagicLinkAction } from "./actions";
import { googleSignInAction } from "../oauth-actions";
import { DEMO_BLOCK_MESSAGE } from "@/lib/demo/constants";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function SignupForm({
  redirectTo,
  googleEnabled = false,
}: {
  redirectTo: string;
  googleEnabled?: boolean;
}) {
  const { showDemoToast } = useDemoToast();
  const [state, action, pending] = useActionState(sendMagicLinkAction, {});
  // 2026-05-22 — redirectTo is computed server-side in page.tsx from the
  // ?url= / ?biz= / ?intent= query params (or /claim?token=... for
  // claim flows). The default path lands the visitor on /signup/billing
  // for the card-collection step, then on to /clients/new with prefill.
  const callbackUrl = redirectTo;

  useEffect(() => {
    if (state.error === DEMO_BLOCK_MESSAGE) {
      showDemoToast();
    }
  }, [showDemoToast, state.error]);

  return (
    <div className="space-y-5 text-foreground">
      {googleEnabled ? (
        <>
          <form action={googleSignInAction}>
            <input type="hidden" name="redirectTo" value={callbackUrl} />
            <button type="submit" className="crm-button-primary h-10 w-full px-4">
              Continue with Google
            </button>
          </form>
          <div className="flex items-center gap-3 text-xs text-[hsl(var(--color-text-secondary))]">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form action={action} className="space-y-3">
        <input type="hidden" name="redirectTo" value={callbackUrl} />
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

        <button
          type="submit"
          disabled={pending}
          className={googleEnabled ? "crm-button-secondary h-10 w-full px-4" : "crm-button-primary h-10 w-full px-4"}
        >
          {pending ? "Sending magic link..." : "Continue with email link"}
        </button>
      </form>

      {/* a11y-review: role="alert" makes SR users hear the error
          immediately on render (assertive live region). */}
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}

      {state.sent && state.email ? (
        /* a11y-review: role="status" announces the success card to SR
           users without interrupting (polite live region). */
        <div role="status" className="space-y-3 rounded-xl border border-border bg-card p-4">
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
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
