// v1.30.2 — Docs article: Anthropic / OpenAI (LLM keys).

import { ArticleShell, Callout, InAppLink, Step } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Integrations"
      categoryHref="/docs"
      title="Anthropic / OpenAI"
      lede="On hosted SeldonFrame, AI is managed and included on every plan — there's no key to paste. You only supply your own Anthropic or OpenAI key when you self-host."
      githubPath="app/docs/integrations/llm/page.tsx"
    >
      <h2>Hosted: AI is managed for you</h2>
      <p>
        Every hosted plan ships with managed AI. Your chatbot, your
        generated copy, and your automations call the model for you —
        you never touch an LLM key, and there's no token bill to watch.
      </p>
      <ul>
        <li>No key to create, paste, or rotate.</li>
        <li>No per-token markup and no metered usage wallet — pricing is flat and seat-based.</li>
        <li>No "credit balance too low" surprises mid-conversation; the platform keeps the lights on.</li>
        <li>The right model is selected for each task — you don't manage providers.</li>
      </ul>

      <Callout variant="tip" title="Nothing to configure">
        On hosted SeldonFrame there's no "LLM keys" screen to fill in.
        Build a chatbot and it just works. AI is part of the plan.
      </Callout>

      <h2>Self-host: bring your own key</h2>
      <p>
        Self-hosting SeldonFrame is free under AGPL-3.0, and it's the one
        path where you supply your own model key. Your agents call your
        provider directly with your key, encrypted at rest — SeldonFrame
        never holds the LLM bill.
      </p>

      <Step n={1} title="Get a key">
        Go to{" "}
        <a href="https://console.anthropic.com/" target="_blank" rel="noopener">
          console.anthropic.com
        </a>{" "}
        (or{" "}
        <a href="https://platform.openai.com/" target="_blank" rel="noopener">
          platform.openai.com
        </a>
        ), create an API key, and copy it.
      </Step>
      <Step n={2} title="Add it to your deployment">
        In your self-hosted instance, open{" "}
        <InAppLink href="/settings/integrations/llm">Settings → LLM keys</InAppLink>{" "}
        → "Add Anthropic key" (or OpenAI). Paste the key. SeldonFrame
        encrypts it with your deployment's encryption key and stores it.
      </Step>
      <Step n={3} title="Verify">
        Click "Test connection." We make a tiny call to the provider — if
        it succeeds, you're done.
      </Step>

      <Callout variant="warn" title="Top-up your account (self-host)">
        When you bring your own key, Anthropic and OpenAI both require a
        positive balance to make calls. If your agent suddenly stops
        responding, the most common cause is a depleted balance.
        SeldonFrame surfaces the actual provider error ("credit balance
        too low") so you know what to fix.
      </Callout>

      <h2>Encryption at rest (self-host)</h2>
      <p>
        Your key is encrypted with AES-256-GCM using a per-deployment
        ENCRYPTION_KEY env var. The encrypted key is stored in Postgres;
        the env var lives only in your own project. Two-key compromise is
        required to decrypt.
      </p>

      <h2>Switching providers per agent (self-host)</h2>
      <p>
        When self-hosting, you can configure each agent independently —
        agent A uses Anthropic, agent B uses OpenAI. Set in{" "}
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
