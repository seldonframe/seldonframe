// v1.30.2 — Docs article: Twilio (SMS).

import { ArticleShell, Callout, ComingSoon, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Integrations"
      categoryHref="/docs"
      title="Twilio (SMS)"
      lede="Send SMS from your business number for booking reminders, follow-ups, and one-off messages. Voice and AI-powered SMS conversations are next."
      githubPath="app/docs/integrations/twilio/page.tsx"
    >
      <h2>Setup</h2>
      <p>
        <InAppLink href="/settings/integrations">Settings → Integrations</InAppLink>{" "}
        → Twilio → paste your Account SID, Auth Token, and the phone
        number you want to send from.
      </p>
      <p>
        US/Canada SMS requires{" "}
        <a href="https://www.twilio.com/docs/messaging/compliance/a2p-10dlc" target="_blank" rel="noopener">
          A2P 10DLC registration
        </a>{" "}
        — Twilio walks you through it. Plan a few business days for
        approval before you go live.
      </p>

      <h2>What works today</h2>
      <ul>
        <li><strong>Booking reminders.</strong> 24h SMS before each booking — see <a href="/docs/automation/reminders">Post-booking reminders</a>.</li>
        <li><strong>Automation actions.</strong> Any rule can include "Send SMS" as an action.</li>
        <li><strong>One-off messages</strong> from a contact's profile.</li>
      </ul>

      <ComingSoon>
        Two-way SMS conversations with your AI agent are on the roadmap
        — see <a href="/docs/agents/voice-sms">Voice + SMS</a>. The
        infrastructure is in place; we're waiting on channel-specific
        eval scenarios before flipping it on.
      </ComingSoon>

      <Callout variant="warn" title="Compliance reminder">
        Every marketing SMS in the US/Canada must include "Reply STOP to
        unsubscribe." SeldonFrame appends this automatically to broadcast
        sends. You're responsible for honoring opt-outs (we maintain the
        suppression list automatically when STOP is received).
      </Callout>

      <h2>Costs</h2>
      <p>
        Twilio bills you directly for SMS, voice, and phone numbers.
        SeldonFrame doesn't markup or rebill. Typical US SMS is ~$0.0083
        per segment.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/automation/reminders">Post-booking reminders</InAppLink></li>
        <li><InAppLink href="/docs/agents/voice-sms">Voice + SMS</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
