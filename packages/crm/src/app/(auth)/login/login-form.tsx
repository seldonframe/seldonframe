"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});

  return (
    <form action={action} className="space-y-4 text-foreground">
      <div className="space-y-1">
        <label htmlFor="email" className="text-label text-foreground">
          Email
        </label>
        <input id="email" name="email" type="email" required className="crm-input h-10 w-full px-3" />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="text-label text-foreground">
          Password
        </label>
        <input id="password" name="password" type="password" required className="crm-input h-10 w-full px-3" />
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <button type="submit" disabled={pending} className="crm-button-primary h-10 w-full px-4">
        {pending ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-center text-label text-[hsl(var(--color-text-secondary))]">
        No account yet? <Link href="/signup" className="font-medium text-primary underline underline-offset-4">Create one</Link>
      </p>
    </form>
  );
}
