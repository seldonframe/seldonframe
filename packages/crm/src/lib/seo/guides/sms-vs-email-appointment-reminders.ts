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
  dek: "Both text and email reminders reduce no-shows compared with sending nothing — that's the part with real evidence behind it, and it's the part that matters most. The choice between them is less about which is universally \"better\" and more about which one your clients actually read, what each costs you, and how you combine them. Here's an honest comparison for a booking-heavy local business, without the inflated stats you'll see quoted elsewhere.",
  sections: [
    {
      h2: "First, the thing that's actually proven",
      body: "Before comparing the two channels, it's worth being clear about what the research supports. The strong, well-evidenced finding isn't \"SMS beats email\" — it's that reminders beat no reminder. A Cochrane systematic review of mobile phone text-message reminders for healthcare appointments found they raised attendance compared with sending nothing, lifting attendance from roughly 68% to around 79% in the pooled studies, while cautioning that the underlying evidence is of low to moderate quality and the effect varies by setting. Notably, that same review found text reminders performed similarly to phone-call reminders while costing less — a useful hint that the channel matters less than the reminder itself.\n\nSo the honest framing is this: the biggest win by far is going from no reminders to any reminders. The SMS-versus-email decision is a second-order optimization on top of that. Get a reminder sequence running in whatever channel you can first; then refine the mix.",
    },
    {
      h2: "Where SMS tends to win",
      body: "Text has real structural advantages for reminders. It arrives in a channel people check constantly, it doesn't fight a spam folder or a promotions tab, and it's typically read within minutes rather than sitting unopened for hours. For a same-day or morning-of nudge — exactly when a reminder does the most good — that immediacy is hard to beat. You'll see very high SMS \"open rate\" figures quoted online, often around 98% versus roughly 20% for email. Treat those with caution: SMS has no reliable way to measure an actual open (there's no tracking pixel equivalent), so those numbers are marketing estimates inferred from delivery and response data, not hard measurements. The directional point still holds — texts get seen faster and more reliably than emails — but the precise percentages aren't something to quote as fact.\n\nThe trade-offs: SMS usually costs a few cents per message where email is effectively free, texts have tight length limits, and they demand proper consent and opt-out handling. For most booking-heavy businesses the cost is trivial next to a single recovered no-show, but it's real, and it scales with volume.",
    },
    {
      h2: "Where email still earns its place",
      body: "Email isn't obsolete for reminders — it's just better at a different job. It's effectively free at any volume, it gives you room for the details a text can't hold (address, prep instructions, parking, intake forms, a policy line), and it leaves the client a searchable record they can find later. That makes email the natural home for the confirmation you send right when the appointment is booked, where completeness matters more than immediacy.\n\nEmail's weakness is exactly SMS's strength: it competes with a crowded inbox, filtering layers, and the promotions tab, so it's slower and less certain to be seen — a poor fit for the time-sensitive morning-of nudge. It also depends on you having a valid, monitored address, which isn't always the case for walk-in-heavy businesses. Used for the right job, though, email carries real weight and costs you nothing.",
    },
    {
      h2: "The honest answer: use both, by job",
      body: "For most med spas, salons, and dental offices, the best setup isn't choosing one channel — it's assigning each to what it's good at. A common, sensible pattern: send a detailed confirmation by email at booking, then a short reminder by text a day or two out and a brief morning-of text for same-day certainty. That way each message plays to its channel's strength — email for completeness, text for immediacy — and you're covered even if a client only reliably reads one of them.\n\nWhatever mix you choose, the value comes from the reminders existing and going out consistently, not from the channel debate. To see what your current no-shows are costing and how much even a modest reduction is worth, run your numbers through our no-show cost calculator. And if the hard part is remembering to send each message in each channel, an AI receptionist can run the whole sequence automatically — email confirmation, text reminders, and reschedule handling — so the right message goes out on the right channel every time without anyone touching it.",
    },
  ],
  faq: [
    {
      q: "Are SMS or email reminders better at preventing no-shows?",
      a: "The well-evidenced finding is that reminders beat no reminder; the channel is a smaller factor. Text tends to be read faster and more reliably, which suits time-sensitive morning-of nudges, while email is free and better for detailed confirmations. Most booking-heavy businesses do best using both — email for the confirmation, text for the short reminders — rather than picking one.",
    },
    {
      q: "Is the 98% SMS open rate real?",
      a: "Treat it as a marketing estimate, not a measured fact. Unlike email, SMS has no tracking-pixel equivalent, so an \"open\" can't be directly measured; the high figures you see quoted are inferred from delivery and response data. The reliable, honest point is that texts are typically seen faster and more consistently than emails — but the exact percentage isn't something to state as proven.",
    },
    {
      q: "Does it cost more to send text reminders?",
      a: "Usually yes — SMS typically costs a few cents per message where email is effectively free, and it requires proper consent and opt-out handling. For most appointment-based businesses that cost is trivial compared with the revenue of a single recovered no-show, but it scales with volume, which is one reason many businesses reserve texts for the time-sensitive reminders and use email for the rest.",
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
