"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { sendMagicLinkAction } from "./actions";
import { DEMO_BLOCK_MESSAGE } from "@/lib/demo/constants";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.8-5.4 3.8-3.3 0-5.9-2.7-5.9-5.9s2.6-5.9 5.9-5.9c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.5 14.7 2.5 12 2.5A9.5 9.5 0 0 0 2.5 12 9.5 9.5 0 0 0 12 21.5c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.9H12Z" />
      <path fill="#34A853" d="M3.6 7.6 6.8 10c.9-2.1 2.9-3.9 5.2-3.9 1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.5 14.7 2.5 12 2.5 8.4 2.5 5.2 4.5 3.6 7.6Z" />
      <path fill="#FBBC05" d="M12 21.5c2.6 0 4.8-.9 6.4-2.5l-3.1-2.5c-.8.6-1.9 1.1-3.3 1.1-3.8 0-5.2-2.6-5.4-3.8l-3.2 2.5c1.6 3.1 4.8 5.2 8.6 5.2Z" />
      <path fill="#4285F4" d="M21.2 12.1c0-.6-.1-1.1-.2-1.9H12v3.9h5.4c-.3 1.6-1.4 2.8-2.8 3.6l3.1 2.5c1.9-1.8 3.1-4.4 3.1-8.1Z" />
    </svg>
  );
}

export function LoginForm() {
  const { showDemoToast } = useDemoToast();
  const [state, action, pending] = useActionState(sendMagicLinkAction, {});
  const [googlePending, setGooglePending] = useState(false);

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
      callbackInput.value = "/setup";

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
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Check your inbox.</p>
          )}
        </div>
      ) : null}

      <p className="text-center text-label text-[hsl(var(--color-text-secondary))]">
        New here? <Link href="/signup" className="font-medium text-primary underline underline-offset-4">Start for free →</Link>
      </p>
    </div>
  );
}
