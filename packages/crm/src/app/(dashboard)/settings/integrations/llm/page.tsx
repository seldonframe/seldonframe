// v1.27.6 — workspace-level LLM provider key UI.
//
// SF clients paste their Anthropic / OpenAI key here. Stored encrypted
// at rest in organizations.integrations[provider].apiKey, decrypted at
// agent-turn time by lib/ai/client.getAIClient(). Same storage path as
// the MCP `configure_llm_provider` tool — both surface this UI and the
// MCP tool write to the same column with the same encryption.
//
// The /agents/[id]/test pre-flight banner deep-links here when a key
// is missing.
//
// 2026-05-27 — Shares the <AnthropicKeyField> + <EncryptionNotice>
// primitives with the /signup/connect-ai onboarding gate so the field
// shape, helper line, and encryption notice can't drift between the
// settings and signup surfaces. OpenAI continues to render its own
// inline field because it's a settings-only slot (the user-facing
// build path is Anthropic-only).

import Link from "next/link";
import {
  AnthropicKeyField,
  EncryptionNotice,
} from "@/components/integrations/anthropic-key-field";
import {
  getLlmIntegrationSettings,
  removeLlmKeyAction,
  saveLlmKeyAction,
  type LlmProviderStatus,
} from "@/lib/integrations/llm/actions";

export const dynamic = "force-dynamic";

export default async function LlmIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    removed?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const settings = await getLlmIntegrationSettings();

  if (!settings) {
    return (
      <section className="animate-page-enter">
        <p className="text-sm text-muted-foreground">
          Sign in to manage LLM provider keys.
        </p>
      </section>
    );
  }

  const savedMessage = params.saved
    ? `${params.saved} key saved. Your agents will use it on the next turn.`
    : null;
  const removedMessage = params.removed
    ? `${params.removed} key removed. Agents using this provider will pause until a new key is saved.`
    : null;
  const errorMessage = params.error
    ? decodeURIComponent(params.error)
    : null;

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <Link
          href="/settings/integrations"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← All integrations
        </Link>
        <h1 className="mt-1 text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
          AI / LLM Providers
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Bring your own Anthropic or OpenAI key. Used by your agents at
          customer chat time. Stored encrypted at rest. SF charges separately
          for agent platform usage — you pay the LLM provider directly.
        </p>
      </div>

      {savedMessage && (
        <p className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
          ✓ {savedMessage}
        </p>
      )}
      {removedMessage && (
        <p className="rounded-md border border-caution/30 bg-caution/10 px-3 py-2 text-sm text-caution">
          {removedMessage}
        </p>
      )}
      {errorMessage && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
          ✗ {errorMessage}
        </p>
      )}

      <AnthropicProviderCard
        subtitle="Claude — recommended for v1.26.x agents (best tool-use support)."
        status={settings.anthropic}
      />

      <OpenAiProviderCard
        subtitle="GPT-4 family — limited tool-use support in v1.26.x; full support queued for v1.28."
        status={settings.openai}
      />

      <EncryptionNotice
        trailing={
          <>
            You can also configure these from Claude Code via the{" "}
            <code className="font-mono">configure_llm_provider</code> MCP tool.
          </>
        }
      />
    </section>
  );
}

/** Settings-side Anthropic card. Wraps the shared <AnthropicKeyField>
 *  with the settings-specific framing (Configured / Not configured badge,
 *  current-key hint, Replace / Remove affordances). */
function AnthropicProviderCard({
  subtitle,
  status,
}: {
  subtitle: string;
  status: LlmProviderStatus;
}) {
  const placeholder = status.configured
    ? "Paste a new key to replace the current one"
    : "sk-ant-...";
  return (
    <article className="rounded-xl border bg-card p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-card-title">Anthropic</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <StatusBadge configured={status.configured} />
      </header>

      {status.configured && (
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-1">
          {status.hint && (
            <p>
              Current key: <code className="font-mono">{status.hint}</code>
            </p>
          )}
          {status.savedAt && (
            <p>Saved {new Date(status.savedAt).toLocaleString()}</p>
          )}
        </div>
      )}

      <form action={saveLlmKeyAction} className="space-y-3">
        <input type="hidden" name="provider" value="anthropic" />
        <AnthropicKeyField inputId="apiKey-anthropic" placeholder={placeholder} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="crm-button-primary h-10 px-5 text-sm">
            {status.configured ? "Replace key" : "Save key"}
          </button>
        </div>
      </form>

      {status.configured && (
        <form action={removeLlmKeyAction}>
          <input type="hidden" name="provider" value="anthropic" />
          <button
            type="submit"
            className="text-xs text-rose-600 hover:underline"
          >
            Remove key
          </button>
        </form>
      )}
    </article>
  );
}

/** OpenAI card — same wrapper shape but the field is bespoke (no shared
 *  primitive yet because the build path doesn't consume OpenAI; once it
 *  does, extract <OpenAiKeyField> along the same line). */
function OpenAiProviderCard({
  subtitle,
  status,
}: {
  subtitle: string;
  status: LlmProviderStatus;
}) {
  const placeholder = status.configured
    ? "Paste a new key to replace the current one"
    : "sk-...";
  return (
    <article className="rounded-xl border bg-card p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-card-title">OpenAI</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <StatusBadge configured={status.configured} />
      </header>

      {status.configured && (
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground space-y-1">
          {status.hint && (
            <p>
              Current key: <code className="font-mono">{status.hint}</code>
            </p>
          )}
          {status.savedAt && (
            <p>Saved {new Date(status.savedAt).toLocaleString()}</p>
          )}
        </div>
      )}

      <form action={saveLlmKeyAction} className="space-y-3">
        <input type="hidden" name="provider" value="openai" />
        <div className="space-y-1">
          <label htmlFor="apiKey-openai" className="text-label">
            OpenAI API key
          </label>
          <input
            id="apiKey-openai"
            name="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="crm-input h-10 w-full px-3 font-mono text-sm"
            placeholder={placeholder}
            required
          />
          <p className="text-xs text-muted-foreground">
            Get a key from{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              platform.openai.com
            </a>
            . Add credits at{" "}
            <a
              href="https://platform.openai.com/account/billing/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              billing
            </a>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="crm-button-primary h-10 px-5 text-sm">
            {status.configured ? "Replace key" : "Save key"}
          </button>
        </div>
      </form>

      {status.configured && (
        <form action={removeLlmKeyAction}>
          <input type="hidden" name="provider" value="openai" />
          <button
            type="submit"
            className="text-xs text-rose-600 hover:underline"
          >
            Remove key
          </button>
        </form>
      )}
    </article>
  );
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
        configured
          ? "border-positive/20 bg-positive/10 text-positive"
          : "border-caution/20 bg-caution/10 text-caution"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          configured ? "bg-positive" : "bg-caution"
        }`}
        aria-hidden="true"
      />
      {configured ? "Configured" : "Not configured"}
    </span>
  );
}
