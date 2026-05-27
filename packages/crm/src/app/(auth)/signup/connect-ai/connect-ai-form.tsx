// packages/crm/src/app/(auth)/signup/connect-ai/connect-ai-form.tsx
//
// 2026-05-27 — Client Component for the new step 2/2 of signup. Lean
// match to the visual of /signup/billing/signup-card-form.tsx so the
// visitor doesn't feel like they switched surfaces between magic-link
// click and BYOK collection.
//
// One required field (Anthropic API key), two helper links inline:
//   - "How to get a key →" deep-links to the Anthropic console.
//   - "What's an API key?" toggles an inline disclosure with 2–3 sentences
//     explaining the BYOK contract in plain English.
//
// No OpenAI field — the user-facing build path (extraction, soul gen,
// chatbot replies) is exclusively Anthropic. A grep across
// packages/crm/src/lib/agents, lib/web-onboarding, lib/landing, lib/soul
// returned zero `import OpenAI` / `from "openai"` hits as of 2026-05-27,
// so adding an OpenAI input here would be a button that does nothing.
// The /settings/integrations/llm page exposes the OpenAI slot for the
// MCP `configure_llm_provider` tool (which writes the same JSONB column
// but for runtime fallback configuration that the current build path
// doesn't consume).

"use client";

import Link from "next/link";
import { useActionState, useState, useId } from "react";

import { saveConnectAiKeyAction, type SaveConnectAiKeyState } from "./actions";

const INITIAL_STATE: SaveConnectAiKeyState = {};

const ANTHROPIC_CONSOLE_URL = "https://console.anthropic.com/settings/keys";

export type ConnectAiFormProps = {
  /** Where to send the visitor after the key is saved. Pre-sanitized by
   *  the parent server component; the server action re-validates via
   *  sanitizeNextPath() before redirecting. */
  next: string;
};

export function ConnectAiForm({ next }: ConnectAiFormProps) {
  const [state, formAction, pending] = useActionState(saveConnectAiKeyAction, INITIAL_STATE);
  const [showExplainer, setShowExplainer] = useState(false);
  const apiKeyId = useId();
  const explainerId = useId();

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <label htmlFor={apiKeyId} className="text-label text-foreground">
          Anthropic API key
        </label>
        <input
          id={apiKeyId}
          name="apiKey"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-..."
          className="crm-input h-10 w-full px-3 font-mono text-sm"
          aria-describedby={showExplainer ? explainerId : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <a
          href={ANTHROPIC_CONSOLE_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline-offset-4 hover:underline"
        >
          How to get a key &rarr;
        </a>
        <button
          type="button"
          onClick={() => setShowExplainer((s) => !s)}
          aria-expanded={showExplainer}
          aria-controls={explainerId}
          className="text-[hsl(var(--color-text-secondary))] underline-offset-4 hover:underline"
        >
          {showExplainer ? "Hide explanation" : "What's an API key?"}
        </button>
      </div>

      {showExplainer ? (
        <div
          id={explainerId}
          className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-[hsl(var(--color-text-secondary))]"
        >
          It&apos;s a personal token from Anthropic that lets SeldonFrame use
          Claude on your behalf. You pay Anthropic directly — usually pennies
          per workspace. We never see or store your billing info; we only
          store the key (encrypted) so we can call Claude when you build a
          workspace or a chatbot replies.
        </div>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="crm-button-primary h-10 w-full px-4"
      >
        {pending ? "Saving key…" : "Save key and continue"}
      </button>

      <p className="text-center text-xs text-[hsl(var(--color-text-secondary))]">
        Already have a SeldonFrame account?{" "}
        <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
          Sign in
        </Link>
      </p>
    </form>
  );
}
