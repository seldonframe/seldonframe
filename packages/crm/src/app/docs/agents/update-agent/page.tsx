// v1.30.2 — Docs article: Updating an agent.

import { ArticleShell, Callout, CodeBlock, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="AI Agents"
      categoryHref="/docs"
      title="Updating an agent"
      lede="Edit personality, swap models, add a tool, raise prices. Every change re-runs the eval suite — your live agent never silently regresses."
      githubPath="app/docs/agents/update-agent/page.tsx"
    >
      <h2>Three ways to update</h2>

      <h3>1. Through Claude Code (fastest)</h3>
      <p>
        Tell Claude Code what you want changed. The MCP tool is{" "}
        <code>update_website_chatbot</code>. It applies the diff, re-runs
        evals, and reports whether the agent still passes the gate.
      </p>
      <CodeBlock language="text">{`> Update Acme Dental's chatbot. Raise the cleaning price
  from $120 to $135. Add a "before-and-after photos" FAQ
  pointing to /gallery. Re-run evals.`}</CodeBlock>

      <h3>2. Through the dashboard</h3>
      <p>
        Open <InAppLink href="/agents">Agents</InAppLink> → pick the
        agent → Settings tab. Change Soul, Brain, or tools. Hit save.
        The agent moves to <code>draft</code> status and you have to
        re-run evals before it can go back to live.
      </p>

      <h3>3. Edit the skill-pack directly</h3>
      <p>
        Agent intelligence lives in markdown skill-packs at{" "}
        <code>packages/crm/src/lib/agents/skills/</code>. Edit the
        markdown, commit, deploy — all agents using that skill-pack get
        the new behavior. Power-user move; useful for agencies updating
        100 client agents at once.
      </p>

      <h2>What happens to live agents during an update</h2>
      <Callout variant="info" title="Zero-downtime by design">
        While you're editing, the live agent keeps serving traffic with
        its previous version. The new version is in <code>draft</code>{" "}
        until evals pass and you publish. There is never a window where
        a half-configured agent is talking to your customers.
      </Callout>

      <h2>Common updates</h2>
      <ul>
        <li>
          <strong>Change a price.</strong> Edit the FAQ snippet → re-run
          evals → publish. The old conversation history stays attached
          to the agent.
        </li>
        <li>
          <strong>Swap the model.</strong> Settings → Brain → pick a new
          model. Re-run evals (different models sometimes change pass
          rates by 5–10%).
        </li>
        <li>
          <strong>Add a tool.</strong> Settings → Tools → enable e.g.{" "}
          <code>send_followup_email</code>. Add a scenario testing the
          new tool. Re-run.
        </li>
        <li>
          <strong>Tighten a refusal rule.</strong> Edit the Soul's refusal
          list. Add a scenario where a customer pushes on the rule. Confirm
          the bot holds.
        </li>
      </ul>

      <h2>Versioning and rollback</h2>
      <p>
        Each publish creates a versioned snapshot. If a v3 update tanks
        eval scores or starts misbehaving in production, hit "Roll back
        to v2" in Settings → Versions. The previous version goes live
        instantly; v3 stays in draft for you to debug.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/agents/eval-gate">Eval gate (safety)</InAppLink></li>
        <li><InAppLink href="/docs/agents/embed">Embedding on your site</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
