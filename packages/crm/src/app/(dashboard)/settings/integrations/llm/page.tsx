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

import Link from "next/link";
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

      <ProviderCard
        title="Anthropic"
        subtitle="Claude — recommended for v1.26.x agents (best tool-use support)."
        keyPlaceholder="sk-ant-..."
        keyPattern="sk-ant-"
        consoleUrl="https://console.anthropic.com/settings/keys"
        billingUrl="https://console.anthropic.com/settings/billing"
        status={settings.anthropic}
      />

      <ProviderCard
        title="OpenAI"
        subtitle="GPT-4 family — limited tool-use support in v1.26.x; full support queued for v1.28."
        keyPlaceholder="sk-..."
        keyPattern="sk-"
        consoleUrl="https://platform.openai.com/api-keys"
        billingUrl="https://platform.openai.com/account/billing/overview"
        status={settings.openai}
      />

      <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Keys are encrypted with AES-256-GCM before storage. SF cannot read
        your raw keys — they're only decrypted in memory at agent-turn time.
        You can also configure these from Claude Code via the{" "}
        <code className="font-mono">configure_llm_provider</code> MCP tool.
      </div>
    </section>
  );
}

function ProviderCard(props: {
  title: string;
  subtitle: string;
  keyPlaceholder: string;
  keyPattern: string;
  consoleUrl: string;
  billingUrl: string;
  status: LlmProviderStatus;
}) {
  const { status } = props;
  return (
    <article className="rounded-xl border bg-card p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-card-title">{props.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
            status.configured
              ? "border-positive/20 bg-positive/10 text-positive"
              : "border-caution/20 bg-caution/10 text-caution"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              status.configured ? "bg-positive" : "bg-caution"
            }`}
            aria-hidden="true"
          />
          {status.configured ? "Configured" : "Not configured"}
        </span>
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
        <input type="hidden" name="provider" value={props.status.provider} />
        <div className="space-y-1">
          <label
            htmlFor={`apiKey-${props.status.provider}`}
            className="text-label"
          >
            {props.title} API key
          </label>
          <input
            id={`apiKey-${props.status.provider}`}
            name="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="crm-input h-10 w-full px-3 font-mono text-sm"
            placeholder={
              status.configured
                ? "Paste a new key to replace the current one"
                : props.keyPlaceholder
            }
            required
          />
          <p className="text-xs text-muted-foreground">
            Get a key from{" "}
            <a
              href={props.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              {new URL(props.consoleUrl).hostname}
            </a>
            . Add credits at{" "}
            <a
              href={props.billingUrl}
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
          <input type="hidden" name="provider" value={props.status.provider} />
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
