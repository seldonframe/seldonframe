// v1.30.2 — Docs article: Automation rules.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Email & Automation"
      categoryHref="/docs"
      title="Automation rules"
      lede='Trigger something when something happens. "When a deal moves to Won, email the customer this template and send a Slack ping to my team."'
      githubPath="app/docs/automation/rules/page.tsx"
    >
      <h2>Anatomy of a rule</h2>
      <p>Every rule has three parts:</p>
      <ul>
        <li><strong>Trigger</strong> — the event ("Deal won," "Form submitted," "Booking created," "24h before booking").</li>
        <li><strong>Filter (optional)</strong> — only run when the data matches ("only deals over $1,000," "only bookings of type 'install'").</li>
        <li><strong>Actions</strong> — one or more things to do (send email, create task, hit a webhook, run an agent, send SMS).</li>
      </ul>

      <h2>Building one</h2>
      <p>
        <InAppLink href="/automations">Automations</InAppLink> → "New
        rule." The builder is visual: pick a trigger, optionally add a
        filter, drag actions into the sequence. Save → it's live.
      </p>

      <Callout variant="tip" title="Through Claude Code">
        <em>"When a deal moves to 'Job done,' wait 3 days, then send the
        review-request email template. Skip if the deal value is under
        $200."</em>
      </Callout>

      <h2>Common triggers</h2>
      <ul>
        <li>Contact created / updated / tag added</li>
        <li>Deal stage changed / value updated / won / lost</li>
        <li>Booking created / rescheduled / cancelled / completed</li>
        <li>Form submitted</li>
        <li>Time-based (every Monday 8am, 30 days after deal won)</li>
        <li>Custom webhook (a third-party system POSTs to a SeldonFrame webhook URL)</li>
      </ul>

      <h2>Common actions</h2>
      <ul>
        <li>Send email (template or one-off)</li>
        <li>Send SMS (via Twilio)</li>
        <li>Create / update / move a deal</li>
        <li>Add a tag / change a stage</li>
        <li>Create a task for a teammate</li>
        <li>POST to a webhook (Slack, Zapier, your own backend)</li>
        <li>Run an agent step (e.g. ask the AI agent to draft a follow-up email)</li>
      </ul>

      <h2>Durable workflows under the hood</h2>
      <p>
        Long-running rules (anything with a wait step longer than a few
        seconds) run on Vercel Workflows — they survive deploys, retries
        on failure, and are observable in your dashboard. The 24h
        post-booking reminder is the canonical example; see{" "}
        <InAppLink href="/docs/automation/reminders">Post-booking reminders</InAppLink>.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/automation/reminders">Post-booking reminders</InAppLink></li>
        <li><InAppLink href="/docs/automation/email-templates">Email templates</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
