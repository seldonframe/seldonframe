import type { Guide } from "./types";

export const guide: Guide = {
  slug: "online-booking-best-practices",
  title: "Online Booking Best Practices (That Actually Get People to Finish)",
  description:
    "The online booking best practices that matter for small service businesses: ask for less, show real times, work on mobile, and confirm without friction.",
  targetKeyword: "online booking best practices",
  intent: "informational",
  cluster: "booking",
  relatedTool: "/tools/booking-friction-grader",
  relatedBest: "/best/booking-system-for-small-business",
  dek: "Most online booking advice is about features. The practices that actually move the needle are simpler and more boring: ask for less, show real availability, and make the whole thing finishable on a phone in under a minute. Here's what reliably helps.",
  sections: [
    {
      h2: "Ask for less than you think you need",
      body: "The single most reliable way to get more completed bookings is to cut the number of things you ask for. Every field is a small chance for someone to stall, second-guess, or bounce. The Nielsen Norman Group, which has studied form usability for decades, puts it bluntly: every time you cut a field or question from a form, you increase its conversion rate.\n\nFor a booking, that usually means a name, a way to reach them, and the service and time — and not much else. Anything you can collect later, at the appointment or in a follow-up, should be collected later. Notes, detailed history, and \"how did you hear about us\" fields belong after the booking is safely captured, not in the way of it.",
    },
    {
      h2: "Show real times, not a request form",
      body: "There's a big difference between a form that says \"tell us when you'd like to come in\" and a calendar that shows actual open slots the customer can click. The first one restarts the phone-tag loop you were trying to escape; the second one lets them finish on the spot.\n\nFor this to work, the availability has to be genuinely live. If the page shows times that are already taken or that you can't actually make, you erode trust fast and create cancellations. Sync your booking tool to the calendar you already use so an open slot online always reflects an open slot in reality, buffers and travel time included.",
    },
    {
      h2: "Make it work on a phone",
      body: "Assume most people will book from a phone, often one-handed, sometimes on a patchy connection. That single assumption drives most of the good design choices. Use a single-column layout — the Nielsen Norman Group notes that multiple columns interrupt the vertical momentum of moving down a form. Keep tap targets large, put labels above the fields rather than beside them, and avoid tiny dropdowns for choices that could be buttons.\n\nTest it yourself on your own phone before you publish, and again whenever you change anything. A booking flow that's smooth on a laptop can be quietly broken on mobile — a button below the fold, a keyboard that covers the next field — and you'd never notice from a desk.",
    },
    {
      h2: "Confirm clearly and make changes easy",
      body: "The booking isn't done when the customer hits submit; it's done when they trust that it worked. Send an immediate confirmation with the time, place, and what to expect, and follow up with a reminder before the appointment. Clear confirmations and reminders are also the cheapest no-show insurance you have.\n\nJust as important: make rescheduling and cancelling easy. Counterintuitively, an easy \"change my time\" link protects your calendar, because the alternative to a two-tap reschedule is usually a silent no-show. If you want a structured look at where your current booking flow adds friction — extra fields, hidden costs, mobile snags — the booking friction grader walks it step by step and flags the spots most likely to lose someone.",
    },
  ],
  faq: [
    {
      q: "How many fields should an online booking form have?",
      a: "As few as you can run your business on — often just name, contact, service, and time. Usability research consistently finds that removing non-essential fields raises completion rates, so treat every extra question as something to justify rather than something to add by default.",
    },
    {
      q: "Should I require customers to create an account before booking?",
      a: "Usually no. Forcing account creation before a first booking is a well-documented reason people abandon. Let them book as a guest with just contact details, and offer an account later as a convenience rather than a gate.",
    },
    {
      q: "Should I take payment or a deposit at the time of booking?",
      a: "It depends on your no-show risk and your jobs. A deposit can reduce no-shows for high-value or hard-to-fill slots, but it also adds friction and will lose some bookings. If no-shows aren't hurting you much, it's often better to keep booking frictionless and collect payment at the appointment.",
    },
  ],
  sources: [
    {
      label: "Nielsen Norman Group — “Website Forms Usability: Top 10 Recommendations”",
      url: "https://www.nngroup.com/articles/web-form-design/",
    },
  ],
};
