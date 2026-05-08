// v1.30.2 — Docs article: The 3-minute demo.

import { ArticleShell, Callout, InAppLink, Step } from "../../article-shell";

export const metadata = {
  title: "The 3-minute demo · Docs",
  description: "Sign up, build a chatbot with Claude Code, run evals, embed on a site, take a booking. Three minutes end-to-end.",
};

export default function Page() {
  return (
    <ArticleShell
      category="Getting started"
      categoryHref="/docs"
      title="The 3-minute demo"
      lede="Watch SeldonFrame go from sign-up to a live, eval-gated chatbot taking a real booking. Three minutes, zero clicks past sign-up — the rest is Claude Code."
      githubPath="app/docs/getting-started/demo/page.tsx"
    >
      <h2>The flow</h2>
      <p>
        Here's what the demo video shows. You can run it yourself in
        the same time — once you've{" "}
        <a href="/docs/getting-started/connect-claude-code">
          connected Claude Code
        </a>
        .
      </p>

      <Step n={1} title="Sign up (30s)">
        Go to <InAppLink href="/signup">/signup</InAppLink>. Pick the HVAC
        template. Name your business "Acme HVAC." You land on the dashboard
        with a starter chatbot already in draft mode.
      </Step>

      <Step n={2} title="Build a chatbot with Claude Code (60s)">
        Open Claude Code and say:{" "}
        <em>"Build me an Acme HVAC website chatbot. It should answer FAQs
        about furnace and AC repair, give pricing for diagnostic visits ($89),
        and book appointments. Use my Anthropic key."</em>
        <br /><br />
        Claude Code calls{" "}
        <code>build_website_chatbot</code> — one tool that creates the
        agent, sets its personality, plugs in the booking tool, generates
        an eval suite, and runs it. You watch the eval bar fill up.
      </Step>

      <Step n={3} title="Eval gate (30s)">
        The agent passes 8/8 scenarios — it correctly answers FAQ
        questions, refuses to make up prices, and successfully books
        a test appointment. Eval pass rate ≥87.5%, so it's allowed
        to publish. Claude Code flips the agent live.
      </Step>

      <Step n={4} title="Embed on a site (15s)">
        Claude Code outputs a one-line embed snippet. Paste it into your
        existing website, or use the auto-generated landing page at{" "}
        <code>acme-hvac.app.seldonframe.com</code>.
      </Step>

      <Step n={5} title="Take a booking (45s)">
        Visit the site as a real user. The chatbot pops up. You ask about
        AC repair, get a quote, ask to book Friday at 2pm. The bot
        confirms, creates a booking in the CRM, and schedules a 24h
        reminder via the post-booking workflow.
        <br /><br />
        Open the dashboard. The booking is there. The contact is there.
        The conversation is logged. The reminder is scheduled.
      </Step>

      <Callout variant="tip" title="Why this matters">
        Every step except step 1 was Claude Code calling MCP tools. No
        admin click-through, no copy-paste, no JSON config. The whole
        operation is reproducible from natural language — which is the
        point.
      </Callout>

      <h2>Try it yourself</h2>
      <p>
        If you have an Anthropic API key, you can run this end-to-end in
        your own workspace right now:
      </p>
      <ol>
        <li><InAppLink href="/signup">Sign up</InAppLink> and pick HVAC.</li>
        <li><InAppLink href="/settings/integrations/llm">Paste your Anthropic key</InAppLink>.</li>
        <li><InAppLink href="/docs/getting-started/connect-claude-code">Connect Claude Code</InAppLink>.</li>
        <li>Tell it the prompt above. Watch it build.</li>
      </ol>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/agents/build-chatbot">How chatbots work in detail</InAppLink></li>
        <li><InAppLink href="/docs/agents/eval-gate">The eval gate (safety)</InAppLink></li>
        <li><InAppLink href="/docs/agents/embed">Embedding on your site</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
