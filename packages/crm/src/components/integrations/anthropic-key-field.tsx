// packages/crm/src/components/integrations/anthropic-key-field.tsx
//
// 2026-05-27 — Shared Anthropic-key field shell used by:
//   - /signup/connect-ai (the step-2/2 onboarding gate)
//   - /settings/integrations/llm (the operational settings page)
//
// The two surfaces wrap this with different framing (signup is a single
// CTA, settings is a Configured/Not-configured badge + Replace/Remove
// affordances) — but the actual input field, placeholder, helper line,
// and console / billing links are identical. Extracted so the two pages
// can't drift on copy or accessibility shape over time.
//
// Pure presentational — no state, no actions. The parent owns the
// <form> and supplies its own action prop, hidden inputs (next, provider,
// etc.), and submit button. This component renders the label + input +
// helper line ONLY, plus the encryption-notice footer when requested
// via `withEncryptionNotice`.
//
// Why two sub-components rather than one big switch:
//   - <AnthropicKeyField> is the input + helper line (used inside a
//     parent <form>).
//   - <EncryptionNotice> is the "Keys are encrypted with AES-256-GCM…"
//     footer that the LLM settings page renders BELOW its provider cards
//     and the signup page renders below its form. Different positions in
//     the DOM, same copy, same role.

import type { ReactNode } from "react";

export const ANTHROPIC_CONSOLE_URL = "https://console.anthropic.com/settings/keys";
export const ANTHROPIC_BILLING_URL = "https://console.anthropic.com/settings/billing";

export type AnthropicKeyFieldProps = {
  /** The id assigned to the <input>. Parents pass useId() or a literal
   *  so the <label htmlFor> wiring is correct. */
  inputId: string;
  /** Optional override for the field's name attribute. Defaults to
   *  "apiKey" — the wire shape both consuming actions expect. */
  name?: string;
  /** Placeholder shown inside the input. The settings page swaps this
   *  to "Paste a new key to replace the current one" when a key is
   *  already configured; the signup page always shows the literal
   *  "sk-ant-...". */
  placeholder?: string;
  /** Optional aria-describedby pointer for an inline disclosure (the
   *  signup page's "What's an API key?" explainer). Settings page
   *  doesn't use this. */
  ariaDescribedBy?: string;
};

/** Anthropic API key input + helper line. Renders a label, password
 *  input, and the "Get a key from console.anthropic.com. Add credits at
 *  billing." helper line that both signup + settings use verbatim. */
export function AnthropicKeyField({
  inputId,
  name = "apiKey",
  placeholder = "sk-ant-...",
  ariaDescribedBy,
}: AnthropicKeyFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="text-label">
        Anthropic API key
      </label>
      <input
        id={inputId}
        name={name}
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="crm-input h-10 w-full px-3 font-mono text-sm"
        placeholder={placeholder}
        required
        aria-describedby={ariaDescribedBy}
      />
      <p className="text-xs text-muted-foreground">
        Get a key from{" "}
        <a
          href={ANTHROPIC_CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          console.anthropic.com
        </a>
        . Add credits at{" "}
        <a
          href={ANTHROPIC_BILLING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          billing
        </a>
        .
      </p>
    </div>
  );
}

export type EncryptionNoticeProps = {
  /** Optional extra ReactNode appended after the canonical sentence.
   *  Settings uses this to add the "or via the configure_llm_provider
   *  MCP tool" line; signup omits it (MCP isn't a relevant escape
   *  hatch mid-signup). */
  trailing?: ReactNode;
  /** Visual variant. "muted" (default) is the bordered grey box the
   *  settings page uses; "footer-text" is the lighter inline text the
   *  signup page wants below its primary CTA. */
  variant?: "muted" | "footer-text";
};

/** Canonical AES-256-GCM encryption notice. Same copy in both places so
 *  operators reading either surface get the same security guarantee
 *  phrased identically. */
export function EncryptionNotice({ trailing, variant = "muted" }: EncryptionNoticeProps) {
  if (variant === "footer-text") {
    return (
      <p className="text-xs text-muted-foreground">
        Keys are encrypted with AES-256-GCM before storage. SF cannot read your
        raw keys — they&apos;re only decrypted in memory at agent-turn time.
        {trailing ? <> {trailing}</> : null}
      </p>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      Keys are encrypted with AES-256-GCM before storage. SF cannot read your
      raw keys — they&apos;re only decrypted in memory at agent-turn time.
      {trailing ? <> {trailing}</> : null}
    </div>
  );
}
