// v1.30.2 — Docs article: Embedding on your site.

import { ArticleShell, Callout, CodeBlock, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="AI Agents"
      categoryHref="/docs"
      title="Embedding on your site"
      lede="One script tag. The chatbot bubble appears on any site you control. Brand-themed, mobile-friendly, latency-tolerant."
      githubPath="app/docs/agents/embed/page.tsx"
    >
      <h2>The snippet</h2>
      <p>
        Open <InAppLink href="/agents">Agents</InAppLink> → pick a live agent
        → "Embed" tab. Copy the snippet and paste it before the closing{" "}
        <code>&lt;/body&gt;</code> tag on any page where you want the bot:
      </p>

      <CodeBlock language="html">{`<script async
  src="https://app.seldonframe.com/embed.js"
  data-agent="agt_abc123"
  data-position="bottom-right">
</script>`}</CodeBlock>

      <p>
        That's it. The bubble appears in the bottom-right corner. Click
        it to open the chat panel. The panel pulls the agent's brand
        colors, name, and avatar from the workspace.
      </p>

      <h2>Customization</h2>
      <p>
        The embed accepts data attributes for common tweaks:
      </p>
      <ul>
        <li><code>data-position</code> — <code>bottom-right</code> (default), <code>bottom-left</code>, <code>inline</code> (mounts wherever the script is placed instead of floating).</li>
        <li><code>data-greeting-delay</code> — milliseconds before the bot proactively greets a visitor. <code>0</code> = on load. <code>-1</code> = never auto-greet.</li>
        <li><code>data-context</code> — a JSON object the agent gets at conversation start. Useful for passing the current page URL, the visitor's known email if they're logged in, or campaign UTM params.</li>
      </ul>

      <CodeBlock language="html">{`<script async
  src="https://app.seldonframe.com/embed.js"
  data-agent="agt_abc123"
  data-position="bottom-right"
  data-greeting-delay="8000"
  data-context='{"page":"/services/furnace-repair","utm":"google-ads"}'>
</script>`}</CodeBlock>

      <h2>SeldonFrame-hosted pages</h2>
      <Callout variant="tip" title="No snippet needed">
        If your public site is a SeldonFrame-hosted page (at{" "}
        <code>your-workspace.app.seldonframe.com</code> or your custom
        domain), the chatbot is wired automatically. You just toggle it
        on/off in <a href="/landing">Pages → Settings</a>.
      </Callout>

      <h2>Custom domains and CSP</h2>
      <p>
        If your site has a strict Content-Security-Policy, you'll need to
        allow <code>app.seldonframe.com</code> as a script source and
        connect source. Minimal example:
      </p>
      <CodeBlock language="text">{`Content-Security-Policy:
  script-src 'self' https://app.seldonframe.com;
  connect-src 'self' https://app.seldonframe.com wss://app.seldonframe.com;
  frame-src 'self' https://app.seldonframe.com;`}</CodeBlock>

      <h2>What conversations are recorded</h2>
      <p>
        Every message round-trip is logged to{" "}
        <InAppLink href="/agents">Agents → Conversations</InAppLink>. The
        agent's identity, the visitor's anonymous session ID (or known
        email if you passed one in <code>data-context</code>), the message
        text, the tool calls, the eval-time validators that fired —
        everything is queryable.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/agents/build-chatbot">Build a chatbot</InAppLink></li>
        <li><InAppLink href="/docs/agents/voice-sms">Voice + SMS (coming soon)</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
