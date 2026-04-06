"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { sendMagicLinkAction } from "./actions";
import { DEMO_BLOCK_MESSAGE } from "@/lib/demo/constants";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

export function SignupForm({ token = "" }: { token?: string }) {
  const { showDemoToast } = useDemoToast();
  const [state, action, pending] = useActionState(sendMagicLinkAction, {});
  const [googlePending, setGooglePending] = useState(false);
  const callbackUrl = token ? `/claim?token=${encodeURIComponent(token)}` : "/setup";

  const handleGoogleSignIn = async () => {
    try {
      setGooglePending(true);
      const response = await fetch("/api/auth/csrf", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Failed to fetch CSRF token");
      }

      const data = (await response.json()) as { csrfToken?: string };

      if (!data.csrfToken) {
        throw new Error("Missing CSRF token");
      }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/signin/google";

      const csrfInput = document.createElement("input");
      csrfInput.type = "hidden";
      csrfInput.name = "csrfToken";
      csrfInput.value = data.csrfToken;

      const callbackInput = document.createElement("input");
      callbackInput.type = "hidden";
      callbackInput.name = "callbackUrl";
      callbackInput.value = callbackUrl;

      form.appendChild(csrfInput);
      form.appendChild(callbackInput);
      document.body.appendChild(form);
      form.submit();
    } catch {
      setGooglePending(false);
    }
  };

  useEffect(() => {
    if (state.error === DEMO_BLOCK_MESSAGE) {
      showDemoToast();
    }
  }, [showDemoToast, state.error]);

  return (
    <div className="space-y-5 text-foreground">
      <button
        type="button"
        disabled={googlePending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium text-zinc-900 shadow-xs transition-all hover:bg-zinc-100"
        onClick={handleGoogleSignIn}
      >
        <GoogleIcon />
        {googlePending ? "Redirecting to Google..." : "Sign in with Google"}
      </button>

      <div className="relative flex items-center justify-center py-1">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[hsl(var(--border))]" />
        <span className="relative bg-[hsl(var(--card))] px-3 text-xs uppercase tracking-[0.08em] text-[hsl(var(--muted-foreground))]">
          or
        </span>
      </div>

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

        <button type="submit" disabled={pending} className="crm-button-secondary h-10 w-full px-4">
          {pending ? "Sending magic link..." : "Continue with email link"}
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
