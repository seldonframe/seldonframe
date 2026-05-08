// v1.30.2 — Docs article: Voice + SMS (coming soon).

import { ArticleShell, ComingSoon, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="AI Agents"
      categoryHref="/docs"
      title="Voice + SMS"
      lede="The same agent you build today will soon answer the phone and reply to texts. Same Soul, same eval gate, three new transports."
      githubPath="app/docs/agents/voice-sms/page.tsx"
    >
      <ComingSoon>
        Voice and SMS transports are on the post-launch roadmap. The
        infrastructure (Twilio integration for SMS, Vapi/Retell for voice)
        is partially in place — what's left is wiring the agent runtime's
        Soul/Brain/tools loop into the phone-call flow and adding voice-
        specific eval scenarios.
      </ComingSoon>

      <h2>What it'll look like</h2>
      <p>
        Imagine you've built and published an HVAC chatbot today. With
        voice and SMS turned on:
      </p>
      <ul>
        <li>
          <strong>SMS.</strong> A customer texts your business number
          (forwarded through Twilio). The same agent picks up the
          conversation. It can book, reschedule, look up history, escalate.
        </li>
        <li>
          <strong>Voice.</strong> A customer calls the same number. The
          agent answers in a natural voice (your choice of provider —
          ElevenLabs, OpenAI Realtime, Vapi). Real-time, sub-500ms
          latency. Same booking tools, same eval-gated safety.
        </li>
        <li>
          <strong>Unified inbox.</strong> All three transports (web chat,
          SMS, voice) feed into the same{" "}
          <InAppLink href="/agents">Conversations</InAppLink> view, threaded
          by contact. You read a customer's full history regardless of
          channel.
        </li>
      </ul>

      <h2>Why we're shipping this last</h2>
      <p>
        Voice and SMS are the highest-stakes channels — a hallucinated
        appointment over the phone is worse than one in chat because the
        customer trusts the voice more. We're holding the launch on
        voice/SMS until we've extended the eval suite with channel-specific
        scenarios (interruptions, accents, hold music, dropped calls,
        late-night SMS) and proven the runtime regenerates on critical
        fails before the customer hears the wrong answer.
      </p>

      <h2>Get notified when it ships</h2>
      <p>
        Subscribe to the{" "}
        <a
          href="https://github.com/seldonframe/seldonframe/releases"
          target="_blank"
          rel="noopener"
        >
          GitHub releases feed
        </a>{" "}
        — voice/SMS will land in a v1.4x release with full migration
        notes. Existing agents won't need changes; you'll just toggle
        the transport on per-agent.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/agents/build-chatbot">Build a chatbot today</InAppLink></li>
        <li><InAppLink href="/docs/agents/embed">Embedding on your site</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
