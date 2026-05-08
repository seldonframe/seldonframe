// v1.30.2 — Docs article: Build a chatbot.

import { ArticleShell, Callout, CodeBlock, InAppLink, Step } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="AI Agents"
      categoryHref="/docs"
      title="Build a chatbot"
      lede="A SeldonFrame chatbot is a Soul (who it is) plus a Brain (which LLM and key) plus tools (what it can do). Build one in a single Claude Code prompt."
      githubPath="app/docs/agents/build-chatbot/page.tsx"
    >
      <h2>The fastest path</h2>
      <p>
        Open Claude Code and say what the chatbot is for. Be specific
        about the business, the persona, the tasks, and the price points.
        SeldonFrame's <code>build_website_chatbot</code> tool bundles
        everything — create, configure, eval, publish — into one round-trip.
      </p>

      <CodeBlock language="text">{`> Build me a website chatbot for "Acme Dental." It should:
  - greet patients warmly, never aggressively
  - answer FAQs about cleanings ($120), fillings ($200-450), whitening ($350)
  - book appointments using my Google Calendar
  - never quote prices outside this list — say "I'll have the office confirm"
  - escalate emergencies (broken tooth, severe pain) to call (555) 010-0100`}</CodeBlock>

      <p>
        Claude Code generates the Soul (personality + system prompt + FAQ
        snippets), wires the booking tool, generates an 8-scenario eval
        suite, runs evals, and reports the pass rate. If it's ≥87.5%, you
        can publish.
      </p>

      <h2>What you can configure</h2>

      <Step n={1} title="Persona (Soul)">
        Name, role, tone, greeting, sign-off. Trusted-source allowlist
        (which facts the bot is allowed to repeat without checking). FAQ
        snippets. Pricing rules. Refusal rules ("never give medical
        advice").
      </Step>

      <Step n={2} title="Brain">
        Pick the LLM provider (Anthropic / OpenAI) and the model
        (Sonnet 4 / Opus 4 / GPT-4 / etc.). Uses your own API key — see{" "}
        <InAppLink href="/settings/integrations/llm">Settings → LLM keys</InAppLink>.
      </Step>

      <Step n={3} title="Tools">
        Pick which capabilities the bot has: book appointments, reschedule,
        cancel, look up customer history, send a follow-up email, etc.
        Each tool is one MCP call.
      </Step>

      <Step n={4} title="Eval suite">
        8 default scenarios cover greetings, FAQ accuracy, booking,
        rescheduling, refusals, PII handling, escalation, and tone
        consistency. You can add your own — Claude Code can write
        scenarios from a real conversation transcript.
      </Step>

      <h2>Manual UI flow</h2>
      <p>
        Prefer clicking? Open <InAppLink href="/agents">Agents</InAppLink> and
        hit "New agent." You get the same five tabs:
      </p>
      <ul>
        <li><strong>Overview</strong> — the agent's stats and live status.</li>
        <li><strong>Sandbox</strong> — chat with it in isolation.</li>
        <li><strong>Conversations</strong> — read what your customers said to it.</li>
        <li><strong>Settings</strong> — Soul, Brain, tools.</li>
        <li><strong>Evals</strong> — run the eval suite, gate publish.</li>
      </ul>

      <Callout variant="tip" title="Skill-pack architecture">
        Agent intelligence (greeting style, refusal patterns, escalation
        logic) lives in markdown skill-packs the prompt composer reads at
        runtime — not in hard-coded TypeScript. So when Claude or GPT
        improves, your agent improves too. No rewrites required.
      </Callout>

      <h2>Going live</h2>
      <p>
        Run evals → if pass rate ≥87.5%, the "Publish" button unlocks →
        the agent flips to <code>live</code> status. Now its embed snippet
        is hot. Drop it on any page.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/agents/eval-gate">Eval gate (safety)</InAppLink></li>
        <li><InAppLink href="/docs/agents/update-agent">Updating an agent</InAppLink></li>
        <li><InAppLink href="/docs/agents/embed">Embedding on your site</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
