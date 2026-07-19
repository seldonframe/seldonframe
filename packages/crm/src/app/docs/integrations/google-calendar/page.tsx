// v1.30.2 — Docs article: Google Calendar.

import { ArticleShell, Callout, InAppLink, Step } from "../../article-shell";

export default function Page() {
  return (
    <ArticleShell
      category="Integrations"
      categoryHref="/docs"
      title="Google Calendar"
      lede="Two-way sync with Google Calendar. Bookings appear there. Busy events block availability here. One OAuth click, no manual feed URLs."
      githubPath="app/docs/integrations/google-calendar/page.tsx"
    >
      <h2>Setup</h2>

      <Step n={1} title="Connect">
        <InAppLink href="/settings/integrations">Settings → Integrations</InAppLink>{" "}
        → Google Calendar → "Connect with Google." OAuth screen, pick the
        Google account that owns your business calendar, grant access.
      </Step>

      <Step n={2} title="Pick which calendars to sync">
        Most people have several calendars (Personal, Work, Family).
        SeldonFrame asks which ones provide busy time and which one
        receives new Seldon bookings. You can change this anytime.
      </Step>

      <h2>How sync works</h2>
      <ul>
        <li>
          <strong>Inbound</strong> — every event on your selected
          calendars (busy time) blocks SeldonFrame booking availability.
          So if you put "Lunch 12–1" on Google, no one can book a
          SeldonFrame slot then.
        </li>
        <li>
          <strong>Outbound</strong> — every booking created in
          SeldonFrame creates a Google Calendar event on your designated
          calendar, with the customer auto-invited as an attendee.
        </li>
        <li>
          <strong>Edits propagate both ways.</strong> Reschedule in
          either system → the other updates within ~30 seconds.
        </li>
      </ul>

      <Callout variant="info" title="Buffers and travel time">
        Buffer rules (e.g. "15 min between bookings") are SeldonFrame-side
        only. Google Calendar's "find a time" doesn't know about your
        Seldon buffer rules — but the slots offered to your customers via
        Seldon booking pages do respect them.
      </Callout>

      <h2>Multiple team calendars</h2>
      <p>
        For agencies / multi-tech businesses: each team member can
        connect their own Google Calendar. Booking pages can route to
        whichever team member is available at the requested slot, or
        offer round-robin assignment.
      </p>

      <h2>Outlook / Apple Calendar</h2>
      <p>
        On the roadmap. CalDAV (which would cover both) is partially
        scoped. For now, Google Calendar is the supported integration.
      </p>

      <h2>Next</h2>
      <ul>
        <li><InAppLink href="/docs/pages/booking">Booking pages</InAppLink></li>
        <li><InAppLink href="/docs/automation/reminders">Post-booking reminders</InAppLink></li>
      </ul>
    </ArticleShell>
  );
}
