// packages/crm/src/app/(auth)/signup/connect-ai/connect-ai-form.tsx
//
// 2026-05-27 — Client Component for the new step 2/2 of signup.
//
// Visual alignment pass (2026-05-27 polish): the field shape, helper line,
// and encryption notice are now extracted into shared primitives at
// @/components/integrations/anthropic-key-field so this surface and the
// /settings/integrations/llm page can't drift on copy or a11y over time.
// This file owns the SIGNUP-specific framing only — primary CTA wording
// ("Save key and continue →"), the inline "What's an API key?" disclosure,
// and the auth-state context. Settings page has its own framing (Configured
// badge + Replace/Remove affordances) and wraps the same shared field.
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

import {
  AnthropicKeyField,
  ANTHROPIC_CONSOLE_URL,
  EncryptionNotice,
} from "@/components/integrations/anthropic-key-field";

import { saveConnectAiKeyAction, type SaveConnectAiKeyState } from "./actions";

const INITIAL_STATE: SaveConnectAiKeyState = {};

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
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />

        <AnthropicKeyField
          inputId={apiKeyId}
          ariaDescribedBy={showExplainer ? explainerId : undefined}
        />

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
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            {showExplainer ? "Hide explanation" : "What's an API key?"}
          </button>
        </div>

        {showExplainer ? (
          <div
            id={explainerId}
            className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
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
          {pending ? "Saving key…" : "Save key and continue →"}
        </button>
      </form>

      <EncryptionNotice variant="footer-text" />

      <p className="text-center text-xs text-muted-foreground">
        Already have a SeldonFrame account?{" "}
        <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
          Sign in
        </Link>
      </p>
    </div>
  );
}
