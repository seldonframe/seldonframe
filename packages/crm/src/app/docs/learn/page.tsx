// v1.30.2 — Docs article: Learn (footer link).

import { ArticleShell, ComingSoon, InAppLink } from "../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Docs"
      categoryHref="/docs"
      title="Learn"
      lede="Tutorials, video walkthroughs, and end-to-end guides for building real things on SeldonFrame."
      githubPath="app/docs/learn/page.tsx"
    >
      <h2>Featured walkthroughs</h2>
      <p>
        Each is a complete, end-to-end build you can follow along with.
        Read the doc, watch the video, run it in your own workspace.
      </p>

      <ul>
        <li>
          <strong><InAppLink href="/docs/getting-started/demo">The 3-minute demo</InAppLink></strong>{" "}
          — sign up to live chatbot to first booking. Start here if
          you've never used SeldonFrame before.
        </li>
        <li>
          <strong>HVAC end-to-end (15 min)</strong> — from sign-up to
          a published HVAC chatbot booking diagnostic visits, sending
          quotes, and following up on lost leads. Coming with the
          launch video.
        </li>
        <li>
          <strong>Dental practice (10 min)</strong> — same arc, dental
          vertical. Custom emergency-escalation rules and HIPAA-aware
          refusal patterns.
        </li>
        <li>
          <strong>Coaching practice (10 min)</strong> — discovery-call
          funnel, paid-session billing through Stripe, post-session
          follow-up automations.
        </li>
      </ul>

      <ComingSoon>
        Video versions of each walkthrough are recording for the launch.
        Subscribe to the{" "}
        <a
          href="https://www.youtube.com/@seldonframe"
          target="_blank"
          rel="noopener"
        >
          YouTube channel
        </a>{" "}
        to get notified when they post.
      </ComingSoon>

      <h2>Concept guides</h2>
      <p>For a deeper understanding of how SeldonFrame works:</p>
      <ul>
        <li><InAppLink href="/docs/getting-started/what-is-seldonframe">What is SeldonFrame</InAppLink></li>
        <li><InAppLink href="/docs/agents/eval-gate">The eval gate (and why it matters)</InAppLink></li>
        <li><InAppLink href="/docs/automation/reminders">Durable workflows in plain English</InAppLink></li>
      </ul>

      <h2>For developers</h2>
      <p>
        If you're a builder rather than an operator, the{" "}
        <a
          href="https://github.com/seldonframe/seldonframe"
          target="_blank"
          rel="noopener"
        >
          GitHub repository
        </a>{" "}
        has the full source: the agent runtime, the MCP server, the
        skill-pack system, and the eval framework. The README has the
        first-principles walkthrough of the architecture.
      </p>

      <h2>Get help</h2>
      <p>
        Stuck? Two places:
      </p>
      <ul>
        <li>
          <a
            href="https://discord.gg/sbVUu976NW"
            target="_blank"
            rel="noopener"
          >
            Discord
          </a>{" "}
          — the SeldonFrame community. Fast, helpful, no enterprise sales reps.
        </li>
        <li>
          <a
            href="https://github.com/seldonframe/seldonframe/issues"
            target="_blank"
            rel="noopener"
          >
            GitHub issues
          </a>{" "}
          — for bugs and feature requests.
        </li>
      </ul>
    </ArticleShell>
  );
}
