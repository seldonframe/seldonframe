import type { Guide } from "./types";

export const guide: Guide = {
  slug: "sms-vs-email-appointment-reminders",
  title: "SMS vs Email Appointment Reminders: Which Actually Prevents No-Shows?",
  description:
    "Should you send appointment reminders by text or email? Here's an honest comparison for med spas, salons, and dental offices — cost, open rates, timing, and what the research supports.",
  targetKeyword: "sms vs email appointment reminders",
  intent: "informational",
  cluster: "no-shows",
  relatedTool: "/tools/no-show-cost-calculator",
  relatedBest: "/ai-agents/ai-receptionist",
  dek: "Both text and email reminders cut no-shows compared with sending nothing — that's the part backed by real evidence, and it's the part that matters most. The choice between the two isn't about which one is universally \"better.\" It's about which one your clients actually read, what each costs you, and how you combine them.\n\nHere's an honest comparison for a booking-heavy local business, without the inflated stats you'll see quoted elsewhere.",
  sections: [
    {
      h2: "First, the thing that's actually proven",
      body: "Before comparing text and email, it helps to know what the research actually backs up.\n\nThe strong finding isn't \"SMS beats email.\" It's that **reminders beat no reminder at all**.\n\nA Cochrane *systematic review* of mobile phone text-message reminders for healthcare appointments found they raised attendance compared with sending nothing. In the pooled studies, attendance went from roughly 68% up to around 79%. The review cautions that the underlying evidence is of low to moderate quality, and the effect varies by setting.\n\nThat same review found one more useful thing: text reminders worked about as well as phone-call reminders, but cost less. That's a hint that **the reminder matters more than the channel**.\n\nSo here's the honest takeaway. The biggest win, by far, is going from no reminders to any reminders. SMS versus email is a smaller, second-order choice on top of that.\n\n**Get some kind of reminder running first** — in whatever channel you can set up fastest. Refine the mix after.",
    },
    {
      h2: "Where SMS tends to win",
      body: "Text has real structural advantages for reminders. It arrives in a channel people check constantly. It doesn't get stuck behind a spam folder or a promotions tab.\n\nTexts are typically **read within minutes**, not left sitting unopened for hours. For a same-day or morning-of nudge — exactly when a reminder does the most good — that speed is hard to beat.\n\nYou'll see very high SMS \"open rate\" figures floating around online, often quoted as roughly 98% versus about 20% for email. **Treat those numbers with caution.**\n\nSMS has no reliable way to measure a real open — there's no *tracking pixel* equivalent like email has. So those figures are marketing estimates inferred from delivery and response data, not hard measurements.\n\nThe directional point still holds: texts get seen faster and more reliably than emails. The precise percentages, though, aren't something to quote as fact.\n\nThere are trade-offs too. SMS usually costs **a few cents per message** where email is effectively free, texts have tight length limits, and they demand proper consent and opt-out handling.\n\nFor most booking-heavy businesses, that cost is trivial next to a single recovered no-show. But it's real, and it scales with volume.",
      callout: {
        kind: "analogy",
        text: "A tracking pixel is a tiny, invisible image hidden inside an email — when your inbox loads it to display the message, that quiet request tells the sender you opened it. Text messages have nothing like it, which is why no one can actually measure a real SMS open rate the way they can for email.",
      },
    },
    {
      h2: "Where email still earns its place",
      body: "Email isn't obsolete for reminders. It's just better suited to a different job.\n\nIt's **effectively free at any volume**, and it gives you room for details a text can't hold — address, prep instructions, parking, intake forms, a policy line. It also leaves the client a searchable record they can find later.\n\nThat makes email the natural home for the confirmation you send right when the appointment is booked, where completeness matters more than speed.\n\nEmail's weakness is exactly SMS's strength. It competes with a crowded inbox, spam filters, and the promotions tab, so it's slower and less certain to be seen — a poor fit for the time-sensitive morning-of nudge.\n\nIt also depends on you having a **valid, monitored address**, which isn't always true for walk-in-heavy businesses. Used for the right job, though, email carries real weight and costs you nothing.",
      callout: {
        kind: "tip",
        text: "If you're walk-in heavy and don't reliably capture a clean email address at booking, lean harder on text — it doesn't need the same upfront contact data to work.",
      },
    },
    {
      h2: "The honest answer: use both, by job",
      body: "For most med spas, salons, and dental offices, the best setup isn't picking one channel. It's **assigning each channel to what it's good at**.\n\nA common, sensible pattern: send a detailed confirmation by email at booking. Then send a short reminder by text a day or two out, and a brief morning-of text for same-day certainty. See [how to set up automated appointment reminders](/guides/how-to-set-up-automated-appointment-reminders) for the full sequence.\n\nThat way each message plays to its channel's strength — email for completeness, text for speed. You're covered even if a client only reliably reads one of them.\n\nWhatever mix you choose, the value comes from the reminders **existing and going out consistently** — not from the channel debate. To see what your current no-shows are costing, and how much even a modest reduction is worth, run your numbers through our [no-show cost calculator](/tools/no-show-cost-calculator).\n\nAnd if the hard part is remembering to send each message on the right channel, an [AI receptionist](/ai-agents/ai-receptionist) can run the whole sequence automatically — email confirmation, text reminders, and reschedule handling — so the right message goes out every time, without anyone touching it.",
      diagram: {
        type: "compare",
        title: "SMS vs email, by job",
        left: {
          heading: "Text",
          items: ["Read in minutes", "A few cents per message", "Best for the morning-of nudge", "Tight length limit"],
        },
        right: {
          heading: "Email",
          items: ["Free at any volume", "Room for full details", "Best for the booking confirmation", "Needs a valid, monitored address"],
        },
      },
    },
  ],
  faq: [
    {
      q: "Are SMS or email reminders better at preventing no-shows?",
      a: "The well-evidenced finding is that reminders beat no reminder — the channel is a smaller factor. Text tends to be read faster and more reliably, which suits time-sensitive **morning-of nudges**. Email is free and better for detailed confirmations.\n\nMost booking-heavy businesses do best using both — email for the confirmation, text for the short reminders — rather than picking one.",
    },
    {
      q: "Is the 98% SMS open rate real?",
      a: "Treat it as a marketing estimate, not a measured fact. Unlike email, SMS has no *tracking pixel* equivalent, so an \"open\" can't be directly measured — the high figures you see quoted are inferred from delivery and response data.\n\nThe reliable, honest point is that texts are typically seen faster and more consistently than emails. The exact percentage, though, isn't something to state as proven.",
    },
    {
      q: "Does it cost more to send text reminders?",
      a: "Usually, yes. SMS typically costs **a few cents per message** where email is effectively free, and it requires proper consent and opt-out handling.\n\nFor most appointment-based businesses, that cost is trivial compared with the revenue of a single recovered no-show — but it scales with volume. That's one reason many businesses reserve texts for the time-sensitive reminders and use email for the rest.",
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
