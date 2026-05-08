// v1.30.2 — Docs article: Connect Claude Code.

import { ArticleShell, Callout, CodeBlock, InAppLink, Step } from "../../article-shell";

export const metadata = {
  title: "Connect Claude Code · Docs",
  description: "Plug Claude Code into your SeldonFrame workspace via MCP. One token, two minutes, and you're driving your CRM and agents from the terminal.",
};

export default function Page() {
  return (
    <ArticleShell
      category="Getting started"
      categoryHref="/docs"
      title="Connect Claude Code"
      lede="SeldonFrame ships with an MCP server. Paste your token into Claude Code and it can read your CRM, build pages, ship agents — all from natural language."
      githubPath="app/docs/getting-started/connect-claude-code/page.tsx"
    >
      <h2>What you'll get</h2>
      <p>
        Once Claude Code is connected, you can say things like:
      </p>
      <ul>
        <li><em>"Build me a website chatbot for my HVAC business that can book appointments."</em></li>
        <li><em>"Add John Smith (john@acme.com) to my CRM with stage 'qualified.'"</em></li>
        <li><em>"Run evals on my customer-support agent and publish if ≥90% pass."</em></li>
        <li><em>"Show me my agent's last 10 conversations and flag any that asked for a refund."</em></li>
      </ul>

      <Step n={1} title="Get your MCP token">
        In the dashboard, open{" "}
        <InAppLink href="/settings/integrations">Settings → Integrations</InAppLink>{" "}
        and copy your MCP bearer token. (Treat it like a password — it
        scopes Claude Code to your workspace.)
      </Step>

      <Step n={2} title="Install the SeldonFrame MCP server">
        It's an npm package. In any Claude Code project:
        <CodeBlock language="bash">{`claude mcp add seldonframe \\
  --transport http \\
  --url https://app.seldonframe.com/api/mcp \\
  --header "Authorization: Bearer <your-token>"`}</CodeBlock>
        Or use the local stdio server (no token, scoped to a single
        workspace via env var):
        <CodeBlock language="bash">{`npm i -g @seldonframe/mcp
claude mcp add seldonframe --command "npx @seldonframe/mcp"`}</CodeBlock>
      </Step>

      <Step n={3} title="Verify">
        In Claude Code, type <code>/mcp</code> and confirm{" "}
        <code>seldonframe</code> shows as connected with a list of tools.
        Then ask <em>"What workspace am I connected to?"</em> — Claude
        Code will call <code>get_workspace_state</code> and answer.
      </Step>

      <Callout variant="tip" title="One tool to rule them all">
        SeldonFrame's MCP exposes 140+ tools, but Claude Code only needs
        two to get oriented: <code>get_workspace_state</code> (snapshot
        of your workspace) and <code>build_website_chatbot</code>{" "}
        (bundled "create + configure + run evals + publish" flow). We
        designed it that way deliberately — fewer tool calls, less
        thrashing, faster builds.
      </Callout>

      <h2>What the MCP can do</h2>
      <p>The full toolset covers:</p>
      <ul>
        <li><strong>CRM</strong> — read/write contacts, deals, bookings, custom fields.</li>
        <li><strong>Agents</strong> — create chatbots, update their personality, run evals, publish to live, embed on your site.</li>
        <li><strong>Pages</strong> — build landing pages, intake forms, booking pages.</li>
        <li><strong>Email</strong> — send transactional email, manage templates.</li>
        <li><strong>Automations</strong> — create rules that fire on CRM events.</li>
        <li><strong>Observability</strong> — read agent conversations, run telemetry queries, inspect eval failures.</li>
      </ul>

      <Callout variant="info" title="BYOK for the LLM">
        Your agent's brain calls the LLM with{" "}
        <em>your own</em> Anthropic or OpenAI key, which you paste into{" "}
        <a href="/settings/integrations/llm">Settings → LLM keys</a>. SeldonFrame
        never holds the LLM bill — you do.
      </Callout>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/agents/build-chatbot">Build a chatbot</InAppLink></li>
        <li><InAppLink href="/docs/getting-started/demo">The 3-minute demo</InAppLink></li>
        <li>
          <a href="https://github.com/seldonframe/seldonframe" target="_blank" rel="noopener">
            Browse the MCP source on GitHub
          </a>
        </li>
      </ul>
    </ArticleShell>
  );
}
