// v1.30.2 — Docs article: Booking pages.

import { ArticleShell, Callout, InAppLink, Step } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Pages & website"
      categoryHref="/docs"
      title="Booking pages"
      lede="Calendly-style scheduling, but native to your CRM. Bookings create real CRM records, fire 24h reminder workflows, and feed your AI agent."
      githubPath="app/docs/pages/booking/page.tsx"
    >
      <h2>What you get</h2>
      <p>
        Each booking page is a public URL where customers pick a time
        from your real calendar. SeldonFrame syncs with Google Calendar
        (Outlook coming) so a slot booked here disappears from your
        availability everywhere.
      </p>

      <h2>Setup</h2>
      <Step n={1} title="Connect your calendar">
        <InAppLink href="/settings/integrations">Settings → Integrations</InAppLink>{" "}
        → Google Calendar → "Connect." OAuth — no manual feed URLs. Pick
        which calendar(s) provide your availability.
      </Step>
      <Step n={2} title="Create a booking type">
        <InAppLink href="/bookings">Bookings</InAppLink> → "New booking type."
        Name it (e.g. "Diagnostic visit"), pick a duration (60 min), set
        a buffer (15 min before/after), and pick which days/hours you
        offer it.
      </Step>
      <Step n={3} title="Set what you collect">
        Each booking type has its own intake form (name, email, phone, plus
        custom fields like "Service address" or "Issue description").
      </Step>
      <Step n={4} title="Share the link">
        Each booking type has a public URL like{" "}
        <code>acme-hvac.app.seldonframe.com/book/diagnostic</code>. Share
        it directly, embed it on a page, or hand it to your chatbot.
      </Step>

      <Callout variant="tip" title="Your chatbot can book directly">
        When you publish an agent with the <code>book_appointment</code>{" "}
        tool, it can reference these booking types and create bookings
        on the customer's behalf — no need to send them off to a separate
        page.
      </Callout>

      <h2>What happens when someone books</h2>
      <ol>
        <li>A booking record is created in your CRM, linked to the contact.</li>
        <li>The slot is reserved on your Google Calendar (with the customer's email auto-invited).</li>
        <li>Confirmation emails go out to both parties.</li>
        <li>
          A <strong>24-hour reminder workflow</strong> is scheduled via
          Vercel Workflows. SMS (if Twilio is connected) or email (if
          Resend is connected) — see{" "}
          <a href="/docs/automation/reminders">Post-booking reminders</a>.
        </li>
      </ol>

      <h2>Reschedule and cancel</h2>
      <p>
        Both parties get a unique link in their confirmation email to
        reschedule or cancel. Customer reschedules → the booking record
        updates, calendar updates, the reminder workflow re-targets the
        new time automatically.
      </p>
      <p>
        If your AI agent handles the reschedule, the same flow runs —
        the agent must call the <code>reschedule_appointment</code> tool
        (the eval gate enforces this; the agent cannot just <em>say</em>{" "}
        it rescheduled).
      </p>

      <h2>Multiple booking types</h2>
      <p>
        You can have as many as you need: free 15-min consult, paid
        30-min strategy call, 90-min on-site visit, etc. Each gets its
        own URL, intake form, duration, and buffer rules.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/pages/forms">Forms & lead capture</InAppLink></li>
        <li><InAppLink href="/docs/automation/reminders">Post-booking reminders</InAppLink></li>
        <li><InAppLink href="/docs/integrations/google-calendar">Google Calendar setup</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
