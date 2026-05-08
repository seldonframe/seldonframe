// v1.30.2 — Docs article: What is SeldonFrame.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export const metadata = {
  title: "What is SeldonFrame · Docs",
  description: "SeldonFrame is an AI-native Business OS — a CRM, website, agents, and automations all in one workspace, built and updated through natural language.",
};

export default function Page() {
  return (
    <ArticleShell
      category="Getting started"
      categoryHref="/docs"
      title="What is SeldonFrame"
      lede="An AI-native Business OS. CRM, website, agents, and automations live in one workspace — and you build all of it through natural language with Claude Code."
      githubPath="app/docs/getting-started/what-is-seldonframe/page.tsx"
    >
      <h2>The short version</h2>
      <p>
        Most small businesses end up paying for five tools — a CRM, a website
        builder, an email tool, a chatbot, and a scheduler — that don't talk
        to each other. SeldonFrame gives you all of that as one workspace.
        Your customers, your booking page, your AI agent, and your reminders
        share the same database, the same brand, and the same admin.
      </p>

      <h2>What you get on day one</h2>
      <ul>
        <li>
          <strong>A CRM</strong> for your contacts, deals, and bookings.
        </li>
        <li>
          <strong>A public website</strong> at <code>your-name.app.seldonframe.com</code>{" "}
          (or your own custom domain) with landing pages, intake forms, and
          booking pages.
        </li>
        <li>
          <strong>AI agents</strong> you can drop on your site as a chatbot.
          They can book, reschedule, and answer questions — all with an
          eval-gated safety check before going live.
        </li>
        <li>
          <strong>Email + automations.</strong> Send emails from your domain.
          Trigger reminders, follow-ups, and sequences from CRM events.
        </li>
      </ul>

      <h2>What makes it AI-native</h2>
      <p>
        Two things. First, the same workspace any operator clicks through
        is also exposed as an MCP server — so Claude Code (or any
        MCP-aware agent) can read and write your CRM, build pages, and
        ship agents through natural language. You can say{" "}
        <em>"build me a chatbot for my HVAC business"</em> in Claude Code
        and watch it happen.
      </p>
      <p>
        Second, the runtime trusts the model. SeldonFrame uses thin
        harnesses and fat skill-packs (markdown skills the prompt composer
        reads), which means the system gets better automatically as
        Claude / GPT / Gemini get better. You don't rewrite SeldonFrame
        when a new model ships.
      </p>

      <Callout variant="tip" title="Antifragile by design">
        The agent runtime regenerates on critical-fail and pulls intelligence
        from editable markdown skill-packs — never from hard-coded heuristics.
        Better models = better outcomes, no rewrites.
      </Callout>

      <h2>Who it's for</h2>
      <p>
        Two audiences. Solo operators (HVAC owner, dentist, coach, agency
        of one) who want a single tool that runs their entire customer
        operation. And agencies — the "Acme AI" of the world — who white-label
        the platform, host their clients on it, and bill them.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li>
          <InAppLink href="/docs/getting-started/first-workspace">
            Build your first workspace
          </InAppLink>
        </li>
        <li>
          <InAppLink href="/docs/getting-started/connect-claude-code">
            Connect Claude Code
          </InAppLink>
        </li>
        <li>
          <InAppLink href="/docs/getting-started/demo">The 3-minute demo</InAppLink>
        </li>
      </ul>
    </ArticleShell>
  );
}
