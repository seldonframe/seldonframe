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
  dek: "A good appointment reminder does **three small jobs**: it reminds the client, it makes confirming effortless, and it gives them an easy way to reschedule instead of quietly not showing up. Below are plain-text templates you can adapt today, plus the timing and details that tend to make them work. Swap in your own business name, and keep them short — a reminder people actually read beats a polished one they ignore.",
  sections: [
    {
      h2: "What every good reminder includes",
      body: "Before the templates, here's the anatomy. A reminder that reliably prevents *no-shows* tends to include five things: **who it's from**, what the appointment is, exactly when it is, a one-tap way to confirm, and an equally easy way to reschedule or cancel.\n\nThe sender name matters more than you'd think. If it's not clearly your business, the text can look like spam and get ignored.\n\nThe reschedule option matters even more. A lot of no-shows are really failed cancellations — the client's plans changed, but there was no easy way to tell you, so they just didn't show.\n\n**A reschedule link turns some of those silent misses into slots you can rebook.**\n\nKeep it short and human. Text reminders get read within minutes, so you have someone's attention — don't waste it on a paragraph.\n\nInclude only what the client needs to act. If you take deposits or have a cancellation window, **one short line is enough** — you don't need to restate a full policy in a reminder.",
      callout: {
        kind: "analogy",
        text: "A no-show is often a failed cancellation, not a broken promise: the client's plans changed and they meant to tell you, but with no fast way to do it, they said nothing and just didn't show.",
      },
      diagram: {
        type: "flow",
        title: "The three jobs a reminder does",
        steps: [
          { label: "Remind", sub: "who, what, when" },
          { label: "Make confirming effortless", sub: "one tap or reply" },
          { label: "Give an easy reschedule path", sub: "instead of silence" },
        ],
      },
    },
    {
      h2: "Text (SMS) reminder templates",
      body: "These are plain-text starting points. Replace the bracketed parts with your details and your own booking or reschedule link.\n\n**Initial confirmation** (send right after booking): \"Hi [Name], you're booked with [Business] for [Service] on [Day, Date] at [Time]. Reply Y to confirm or tap here to reschedule: [link]\"\n\n**Reminder, one to two days before**: \"Hi [Name], reminder: your [Service] at [Business] is [Day] at [Time]. See you then! Need to change it? [link]\"\n\n**Morning-of nudge**: \"See you today, [Name] — [Service] at [Time], [Business]. Reply C to confirm or call [phone] if anything's changed.\"\n\n**Deposit or fee note** (only if you use one): \"Heads up: appointments not cancelled 24h ahead may be subject to a [amount] fee. Reschedule anytime here: [link]\"\n\nThe goal across all of these is **one clear action per message**. If the client has to think about what to do, they'll do nothing.",
      callout: {
        kind: "tip",
        text: "Keep the deposit or fee line to one short sentence, not a policy paste-in. Clients skim reminders — they don't read fine print inside them.",
      },
    },
    {
      h2: "Email reminder templates",
      body: "Email gives you more room, but the same rule applies — front-load the essentials so a skim is enough. These are plain-text bodies you can paste and adapt.\n\n**Confirmation email** subject: \"Your [Business] appointment is confirmed — [Date]\". Body: \"Hi [Name], thanks for booking! Here are your details. Service: [Service]. Date & time: [Day, Date] at [Time]. Location: [Address]. Need to reschedule or cancel? Use this link: [link]. We look forward to seeing you.\"\n\n**Reminder email** subject: \"Reminder: your [Service] is [Day]\". Body: \"Hi [Name], this is a friendly reminder that your [Service] with [Business] is coming up on [Day, Date] at [Time]. If that still works, no action is needed. If you need to change it, you can reschedule here: [link]. Questions? Just reply to this email or call [phone].\"\n\nBecause email is easier to ignore than text, many booking-heavy businesses use email for the initial confirmation and a text for the short reminders closer to the appointment.\n\nWhatever you choose, **being consistent about timing matters more than the exact wording**.",
    },
    {
      h2: "Timing, confirmations, and why this works",
      body: "The templates work because of what's behind them, not the exact words. Appointment reminders are the **best-evidenced way to reduce no-shows**.\n\nA Cochrane *systematic review* of text-message reminders for healthcare appointments found they increased attendance compared with no reminder — attendance rose from roughly 68% to around 79% in the pooled studies.\n\nThe review notes the evidence is of low to moderate quality and the size of the effect varies. So treat reminders as **a reliable lever, not a magic fix** — don't over-optimize the copy.\n\nA sensible cadence for most local businesses: a confirmation immediately at booking, a reminder one to two days out, and a short morning-of message for same-day certainty.\n\nAsking for an **explicit confirmation** — a reply or a tap — does double duty. It prompts the client, and it flags the shaky bookings early enough that you can offer that slot to someone on your *waitlist*.\n\nTo see what your current no-shows are costing, and how much even a modest reduction is worth, run your numbers through our [no-show cost calculator](/tools/no-show-cost-calculator).\n\nAnd if remembering to send each of these is the hard part, an [AI receptionist](/ai-agents/ai-receptionist) can send the whole sequence automatically and handle the replies and reschedules for you.",
      callout: {
        kind: "analogy",
        text: "A systematic review is like polling every trial on a topic instead of trusting one study — Cochrane pooled many separate reminder trials, which is why this attendance number carries more weight than any single study would.",
      },
      diagram: {
        type: "bars",
        title: "Attendance with vs. without a text reminder (Cochrane, pooled studies)",
        items: [
          { label: "No reminder", value: 68, display: "~68%" },
          { label: "With text reminder", value: 79, display: "~79%" },
        ],
        note: "Roughly-and-around figures from the pooled studies in the Cochrane review; the review itself notes the evidence is low-to-moderate quality and the effect size varies.",
      },
    },
  ],
  faq: [
    {
      q: "When should I send appointment reminders?",
      a: "A common and sensible cadence is a confirmation right when the appointment is booked, a reminder one to two days before, and a short morning-of message for same-day appointments. The exact timing matters less than **being consistent** and giving the client an easy way to confirm or reschedule in every message.",
    },
    {
      q: "Should reminders ask the client to confirm?",
      a: "Yes, when you can. A reminder that invites a quick reply or tap does two jobs at once: it nudges the client and it surfaces the bookings that are in doubt, so you can rebook that slot from a waitlist before it's lost. Passive reminders still help, but an **explicit confirm gives you actionable early warning**.",
    },
    {
      q: "Text or email for reminders?",
      a: "Many booking-heavy businesses use email for the detailed confirmation at booking and text for the short reminders near the appointment, since texts are typically read within minutes. Either channel reduces no-shows versus no reminder; the reliable move is to use **whichever your clients actually read** and to keep each message to one clear action.",
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
