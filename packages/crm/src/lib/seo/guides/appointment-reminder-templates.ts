import type { Guide } from "./types";

export const guide: Guide = {
  slug: "appointment-reminder-templates",
  title: "Appointment Reminder Templates That Actually Get a Response",
  description:
    "Copy-and-adapt appointment reminder templates for text and email — for med spas, salons, and dental offices — plus what to include, when to send, and why confirmations matter.",
  targetKeyword: "appointment reminder templates",
  intent: "informational",
  cluster: "no-shows",
  relatedTool: "/tools/no-show-cost-calculator",
  relatedBest: "/ai-agents/ai-receptionist",
  dek: "A good appointment reminder does three small jobs: it reminds the client, it makes confirming effortless, and it gives them an easy way to reschedule instead of quietly not showing up. Below are plain-text templates you can adapt today, plus the timing and details that tend to make them work. Swap in your own business name, and keep them short — a reminder people actually read beats a polished one they ignore.",
  sections: [
    {
      h2: "What every good reminder includes",
      body: "Before the templates, the anatomy. A reminder that reliably prevents no-shows tends to include five things: who it's from (your business name, so it's not mistaken for spam), what the appointment is, exactly when it is, a one-tap way to confirm, and an equally easy way to reschedule or cancel. That last one matters more than people expect — a lot of no-shows are really failed cancellations, where the client's plans changed but there was no frictionless way to tell you, so they just didn't show. Giving them a reschedule link converts some of those silent misses into slots you can rebook.\n\nKeep it short and human. Text reminders in particular get read within minutes, so you have attention — don't waste it on a paragraph. Include only what the client needs to act. If you take deposits or have a cancellation window, one short line stating it is enough; you don't need to restate a full policy in a reminder.",
    },
    {
      h2: "Text (SMS) reminder templates",
      body: "These are plain-text starting points. Replace the bracketed parts with your details and your own booking or reschedule link.\n\nInitial confirmation (send right after booking): \"Hi [Name], you're booked with [Business] for [Service] on [Day, Date] at [Time]. Reply Y to confirm or tap here to reschedule: [link]\"\n\nReminder, one to two days before: \"Hi [Name], reminder: your [Service] at [Business] is [Day] at [Time]. See you then! Need to change it? [link]\"\n\nMorning-of nudge: \"See you today, [Name] — [Service] at [Time], [Business]. Reply C to confirm or call [phone] if anything's changed.\"\n\nDeposit or fee note (only if you use one): \"Heads up: appointments not cancelled 24h ahead may be subject to a [amount] fee. Reschedule anytime here: [link]\"\n\nThe goal across all of these is one clear action per message. If the client has to think about what to do, they'll do nothing.",
    },
    {
      h2: "Email reminder templates",
      body: "Email gives you more room, but the same rule applies — front-load the essentials so a skim is enough. These are plain-text bodies you can paste and adapt.\n\nConfirmation email subject: \"Your [Business] appointment is confirmed — [Date]\". Body: \"Hi [Name], thanks for booking! Here are your details. Service: [Service]. Date & time: [Day, Date] at [Time]. Location: [Address]. Need to reschedule or cancel? Use this link: [link]. We look forward to seeing you.\"\n\nReminder email subject: \"Reminder: your [Service] is [Day]\". Body: \"Hi [Name], this is a friendly reminder that your [Service] with [Business] is coming up on [Day, Date] at [Time]. If that still works, no action is needed. If you need to change it, you can reschedule here: [link]. Questions? Just reply to this email or call [phone].\"\n\nBecause email is easier to ignore than text, many booking-heavy businesses use email for the initial confirmation and a text for the short reminders closer to the appointment. Whatever you choose, being consistent about timing matters more than the exact wording.",
    },
    {
      h2: "Timing, confirmations, and why this works",
      body: "The templates do their job because of what's behind them, not the words themselves. Appointment reminders are the best-evidenced way to reduce no-shows: a Cochrane systematic review of text-message reminders for healthcare appointments found they increased attendance compared with no reminder — attendance rose from roughly 68% to around 79% in the pooled studies — while noting the evidence is of low to moderate quality and the size of the effect varies. So treat reminders as a reliable lever, not a magic fix, and don't over-optimize the copy.\n\nA sensible cadence for most local businesses is: a confirmation immediately at booking, a reminder one to two days out, and a short morning-of message for same-day certainty. Asking for an explicit confirmation (a reply or a tap) does double duty — it prompts the client and it flags the shaky bookings early, so you can offer that slot to someone on your waitlist. To see what your current no-shows are costing and how much even a modest reduction is worth, run your numbers through our no-show cost calculator. And if remembering to send each of these is the hard part, an AI receptionist can send the whole sequence automatically and handle the replies and reschedules for you.",
    },
  ],
  faq: [
    {
      q: "When should I send appointment reminders?",
      a: "A common and sensible cadence is a confirmation right when the appointment is booked, a reminder one to two days before, and a short morning-of message for same-day appointments. The exact timing matters less than being consistent and giving the client an easy way to confirm or reschedule in every message.",
    },
    {
      q: "Should reminders ask the client to confirm?",
      a: "Yes, when you can. A reminder that invites a quick reply or tap does two jobs at once: it nudges the client and it surfaces the bookings that are in doubt, so you can rebook that slot from a waitlist before it's lost. Passive reminders still help, but an explicit confirm gives you actionable early warning.",
    },
    {
      q: "Text or email for reminders?",
      a: "Many booking-heavy businesses use email for the detailed confirmation at booking and text for the short reminders near the appointment, since texts are typically read within minutes. Either channel reduces no-shows versus no reminder; the reliable move is to use whichever your clients actually read and to keep each message to one clear action.",
    },
  ],
  sources: [
    {
      label:
        "Cochrane Database of Systematic Reviews — “Mobile phone messaging reminders for attendance at healthcare appointments” (Gurol-Urganci et al.)",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6485985/",
    },
  ],
};
