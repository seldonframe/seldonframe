"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signupAction } from "@/lib/auth/actions";
import { DEMO_BLOCK_MESSAGE } from "@/lib/demo/constants";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function SignupForm() {
  const router = useRouter();
  const { showDemoToast } = useDemoToast();
  const [state, action, pending] = useActionState(signupAction, {});

  useEffect(() => {
    if (state.success) {
      router.push("/");
    }
  }, [router, state.success]);

  useEffect(() => {
    if (state.error === DEMO_BLOCK_MESSAGE) {
      showDemoToast();
    }
  }, [showDemoToast, state.error]);

  return (
    <form action={action} className="space-y-4 text-foreground">
      <div className="space-y-1">
        <label htmlFor="orgName" className="text-label text-foreground">
          Business Name
        </label>
        <input id="orgName" name="orgName" required className="crm-input h-10 w-full px-3" />
      </div>

      <div className="space-y-1">
        <label htmlFor="name" className="text-label text-foreground">
          Full Name
        </label>
        <input id="name" name="name" required className="crm-input h-10 w-full px-3" />
      </div>

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

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      <button type="submit" disabled={pending} className="crm-button-primary h-10 w-full px-4">
        {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-label text-[hsl(var(--color-text-secondary))]">
        Already have an account? <Link href="/login" className="font-medium text-primary underline underline-offset-4">Sign in</Link>
      </p>
    </form>
  );
}
