// v1.30.2 — Docs article: Post-booking reminders.

import { ArticleShell, Callout, InAppLink } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Email & Automation"
      categoryHref="/docs"
      title="Post-booking reminders"
      lede="A 24-hour reminder fires automatically before every booking — SMS if you have Twilio, email if you don't. Powered by durable Vercel Workflows."
      githubPath="app/docs/automation/reminders/page.tsx"
    >
      <h2>What runs by default</h2>
      <p>
        When a booking is created, SeldonFrame schedules a durable
        workflow that sleeps until 24 hours before the appointment, then
        sends a reminder. SMS first if Twilio is connected; otherwise
        email via Resend.
      </p>

      <h2>Why this matters</h2>
      <p>
        No-show rates drop ~30% with a 24h reminder. Without one, a
        booked-out HVAC tech finds out at noon that the 2pm appointment
        ghosted — half a day's revenue gone.
      </p>

      <Callout variant="info" title="Durable, not cron-fragile">
        The reminder is a Vercel Workflow with <code>sleep("24h")</code>{" "}
        scheduled exactly to the booking. If you redeploy SeldonFrame,
        the workflow keeps its place. If a booking is rescheduled, the
        old workflow is cancelled and a new one is scheduled to the new
        time — no orphan reminders, no double sends.
      </Callout>

      <h2>Customizing</h2>
      <p>
        <InAppLink href="/automations">Automations</InAppLink> → find
        "Post-booking reminder" rule → edit. You can:
      </p>
      <ul>
        <li>Change the lead time (24h → 1h or 48h).</li>
        <li>Add a second reminder (24h + 1h).</li>
        <li>Swap the email template.</li>
        <li>Skip the SMS in favor of WhatsApp (when WhatsApp Business is connected).</li>
        <li>Disable entirely for booking types where reminders aren't useful.</li>
      </ul>

      <h2>Other booking-triggered reminders</h2>
      <p>
        Same pattern works for:
      </p>
      <ul>
        <li><strong>1-hour reminder</strong> for high-value bookings.</li>
        <li><strong>Post-job follow-up</strong> 24h after the booking ends ("Was everything OK? Leave a review.").</li>
        <li><strong>Re-engagement</strong> 90 days after a job ("Time to schedule maintenance?").</li>
      </ul>
      <p>
        Each is a separate rule in <a href="/automations">Automations</a> — same builder.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/automation/rules">Automation rules</InAppLink></li>
        <li><InAppLink href="/docs/integrations/twilio">Twilio (SMS)</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
