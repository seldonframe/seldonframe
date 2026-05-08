// v1.30.2 — Docs article: Anthropic / OpenAI (LLM keys).

import { ArticleShell, Callout, InAppLink, Step } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Integrations"
      categoryHref="/docs"
      title="Anthropic / OpenAI"
      lede="Bring your own LLM key. SeldonFrame never holds the LLM bill — your agents call your provider directly with your key, encrypted at rest."
      githubPath="app/docs/integrations/llm/page.tsx"
    >
      <h2>Why BYOK</h2>
      <p>
        AI agents on SeldonFrame use your own Anthropic or OpenAI key.
        That means:
      </p>
      <ul>
        <li>You pay the LLM provider directly — no markup on tokens.</li>
        <li>You see usage in your provider's dashboard.</li>
        <li>Your data goes to your provider's account, not SF's pooled account.</li>
        <li>SF doesn't ration tokens by tier — you spend what you spend.</li>
      </ul>

      <h2>Anthropic setup</h2>

      <Step n={1} title="Get a key">
        Go to{" "}
        <a href="https://console.anthropic.com/" target="_blank" rel="noopener">
          console.anthropic.com
        </a>
        , create an API key, and copy it.
      </Step>
      <Step n={2} title="Paste it into SeldonFrame">
        <InAppLink href="/settings/integrations/llm">Settings → LLM keys</InAppLink>{" "}
        → "Add Anthropic key." Paste the key. SeldonFrame encrypts it
        with your workspace's encryption key (set as an env var in your
        deployment) and stores it.
      </Step>
      <Step n={3} title="Verify">
        Click "Test connection." We make a tiny call to Claude — if it
        succeeds, you're done.
      </Step>

      <h2>OpenAI setup</h2>
      <p>
        Same flow. Get a key at{" "}
        <a href="https://platform.openai.com/" target="_blank" rel="noopener">
          platform.openai.com
        </a>
        , paste into Settings → LLM keys.
      </p>

      <Callout variant="warn" title="Top-up your account">
        Anthropic and OpenAI both require a positive balance to make
        calls. If your agent suddenly stops responding, the most common
        cause is a depleted balance. SeldonFrame surfaces the actual
        provider error ("credit balance too low") in the chat surface so
        you know what to fix.
      </Callout>

      <h2>Encryption at rest</h2>
      <p>
        Keys are encrypted with AES-256-GCM using a per-deployment
        ENCRYPTION_KEY env var. The encrypted key is stored in Postgres;
        the env var lives only in your Vercel project. Two-key compromise
        is required to decrypt.
      </p>

      <h2>Switching providers per agent</h2>
      <p>
        You can configure each agent independently — agent A uses
        Anthropic Sonnet 4, agent B uses GPT-4. Set in{" "}
        <a href="/agents">Agents → Settings → Brain</a>.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/agents/build-chatbot">Build a chatbot</InAppLink></li>
        <li><InAppLink href="/docs/billing/tiers">Plan tiers</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
