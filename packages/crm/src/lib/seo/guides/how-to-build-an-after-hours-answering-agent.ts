import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-build-an-after-hours-answering-agent",
  title: "How to Build an After-Hours AI Answering Agent (The Wedge Sale for Skeptical Owners)",
  description:
    "After-hours-only is the easiest AI receptionist sale you'll ever make: zero daytime disruption, pure incremental coverage. Here's the spec, the build, and the pitch.",
  targetKeyword: "after hours ai answering service",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/ai-receptionist-cost-calculator",
  relatedBest: "/marketplace",
  dek: "A full 24/7 AI receptionist is a bigger ask than most skeptical owners want to make on a first deal. After-hours-only is the wedge: their staff keeps answering the phone 9-to-5 exactly like today, and the agent only picks up the hours where the alternative is a voicemail nobody returns until morning. This guide covers the after-hours-only build, the spec, and the sale — not the full receptionist (that's a separate build; see the companion guide on [handling after-hours calls](/guides/how-to-handle-after-hours-calls) if you're the business owner evaluating options, not the builder).",
  sections: [
    {
      h2: "Why after-hours-only is the easiest yes",
      body: "Every objection a skeptical owner has to \"replace my receptionist with AI\" evaporates when the pitch is \"answer the phone only when nobody currently does.\" Nothing changes during the day.\n\nTheir staff, their process, their voice on the line — untouched. The agent only picks up the hours where the honest current state is a voicemail box, or nothing at all.\n\nThat framing does two things a full-receptionist pitch can't. First, it **removes the risk**: there's no daytime workflow to disrupt, no staff role to threaten, nothing to \"go wrong\" that wasn't already going wrong (an unanswered phone).\n\nSecond, it **makes the value trivially visible**. Every after-hours call the agent captures is a call that, a month ago, would have gone to voicemail or a competitor. There's no baseline to argue about.\n\nThe wedge logic is straightforward: prove it at night, earn the daytime. An owner who watches three weeks of after-hours calls turn into booked jobs doesn't need convincing that AI answering works — they've seen it work on their own phone line, on the hours they were most worried about giving up.\n\nThe daytime conversation stops being a sales pitch and starts being their idea.",
      callout: {
        kind: "analogy",
        text: "A wedge sale is a foot-in-the-door contractor bid — you don't ask to redo the whole kitchen on day one, you fix the leaky faucet first, do it well, and let that job earn you the bigger one.",
      },
    },
    {
      h2: "The spec: routing, triage, capture, escalation",
      body: "The whole build is four pieces. **Time-based routing** is the switch: during business hours, the line rings through to staff exactly as it does today; outside those hours (and on holidays, if the client wants), it routes to the agent. This is config, not code — a schedule the client defines and can change.\n\n**Emergency triage** is the load-bearing feature, especially for trades. A burst pipe at 2 a.m. and a routine quote request left at 9 p.m. are not the same call, and the agent has to tell them apart.\n\nThe criteria for what counts as an emergency must be written by the client, not assumed by the builder. A plumber's \"emergency\" (active flooding, no heat in winter, no working toilet) is not an electrician's or a locksmith's. Get the client to hand you their real list.\n\nWhen the agent hears an emergency, it **pages the on-call tech immediately** — a phone call or urgent SMS, not a morning digest entry. Routine requests get booked into the next available slot or logged for follow-up.\n\nMessage capture and a morning digest handle everything else: caller name, number, what they need, and any details the agent gathered, delivered as a summary the owner or dispatcher reads over coffee — not forty separate texts. Booking, where the client wants it, lets the agent put routine after-hours callers directly into next-day slots rather than just taking a message.\n\nThree guardrails are non-negotiable regardless of vertical. **Read back the key details** (name, number, what's needed) before confirming anything, so the agent catches its own transcription errors before they become a missed job.\n\nNever promise an arrival time or a specific technician — the agent doesn't control the schedule and shouldn't sound like it does. And always offer the emergency escalation path explicitly rather than silently deciding a call isn't urgent — if there's any doubt, let the human on-call make the call.",
      diagram: {
        type: "flow",
        title: "What happens on an after-hours call",
        steps: [
          { label: "Call after hours", sub: "routed to agent" },
          { label: "Emergency?" },
          { label: "Page on-call now", sub: "if yes" },
          { label: "Book tomorrow", sub: "if no" },
        ],
      },
    },
    {
      h2: "The build: DIY vs. assembled",
      body: "Both paths are legitimate, and the DIY path is genuinely more approachable than most builders assume — say so plainly to a client who asks.\n\n*Conditional call forwarding*, the mechanism that routes the business line to the agent after hours, is standard functionality on most business phone systems and carriers: forward after N unanswered rings, or forward on a schedule. It's a settings change, not a wiring project.\n\nThe DIY stack from there is: the forwarding rule (schedule- or ring-count-based), a voice agent that answers the forwarded call, the emergency-escalation wiring (an SMS or call-out trigger to the on-call number), and a place for the morning digest to land — email, a shared inbox, or a CRM note.\n\nNone of these pieces is exotic. Assembling and testing them together, especially the escalation trigger, is the actual work.\n\nThe assembled path — and disclosure is due here, since we build this — is SeldonFrame: an agent configured for after-hours-only routing, with emergency triage rules loaded from the client's own criteria, message capture and digest wired to the CRM, and next-day booking already connected to the calendar, in one conversation instead of a stack of separately-wired pieces.\n\nFirst workspace is free, *BYOK* keeps the running cost close to the model and telephony provider's own rates, and $29/mo unlocks unlimited workspaces if you're running this for more than one client.\n\nNeither path is \"correct\" in the abstract. If you enjoy owning the wiring and the client relationship doesn't need speed, DIY is real. If the client is a means to a fast, provable pilot, start assembled.",
      callout: {
        kind: "tip",
        text: "Time-box the DIY build to a single afternoon before you commit a client to it — if the forwarding rule and the escalation SMS aren't both working by then, the assembled path will get them live faster.",
      },
    },
    {
      h2: "Selling it: let them hear their own voicemail",
      body: "The single best sales tactic for this wedge doesn't involve a slide deck. Call the prospect's business line at 8 p.m. and let them listen to what actually happens — dead air, a generic voicemail greeting, or a robotic \"the mailbox is full.\"\n\nMost owners have never called their own line after hours; they don't know what a caller hears. Hearing it themselves does more work than any pitch about missed-call statistics.\n\nAnchor the value against what one lost job is worth. For a trade business, one missed emergency call — the burst pipe that gets answered by a competitor because the owner's line rang out — is worth more than a year of the after-hours agent's cost.\n\nYou don't need invented industry statistics to make this argument. The math works with the client's own average job value, which they already know cold. Ask them what an emergency call-out is worth, then let them do the arithmetic against a monthly retainer.\n\nFor context on what human coverage costs if the owner is weighing alternatives: full-service answering services like Ruby price on a per-minute-allowance basis — its published plans run from $250/month for 50 minutes up to $1,725/month for 500 minutes, before any add-ons.\n\nAn after-hours-only AI agent is answering a narrower slice of hours (nights and weekends only, not full call volume) at BYOK-level running costs, which is most of the argument for why the wedge is priced the way it is rather than competing minute-for-minute against a staffed service.",
    },
    {
      h2: "The upgrade path: after-hours proves the daytime pitch",
      body: "The staged path is the whole retention strategy, and it's worth building the pilot with this in mind from day one. After 60-90 days of after-hours coverage, hand the client a simple record: calls answered overnight, jobs booked while they slept, emergencies correctly escalated.\n\nThat record is the daytime pitch, and it writes itself — the owner has already watched three months of proof land in their own inbox.\n\nThe conversation that follows isn't \"should we try AI receptionist\" (already answered). It's \"should the agent also cover the daytime overflow when your staff is on another call, or go full-time.\"\n\nThat's a much easier upgrade to sell than a cold full-receptionist pitch, because the owner isn't taking your word for anything — they're extending something they've already watched work.\n\nBuild the after-hours pilot cleanly, keep the digest and metrics visible, and the upgrade conversation starts itself.",
    },
    {
      h2: "Failure modes to design against",
      body: "**Mishandling a genuine emergency** is the failure that costs the relationship, not just the deal. The triage criteria must come from the client, not a generic template, and they need to be tested — role-play a handful of real after-hours scenarios (the actual emergencies this specific client sees) before going live, not after the first real one goes sideways.\n\n**Booking into slots the business can't honor** is the second common failure. If the agent books a next-day appointment without checking real capacity, the client inherits an overbooked morning and a customer who now has two reasons to be unhappy.\n\nWire booking to the client's actual calendar, not a static slot list, and confirm with the client what \"available\" means before turning booking on.\n\nThe third failure is **attitude, not mechanics**: treating after-hours as the low-stakes shift because it's quiet and unsupervised. For trades especially, after-hours is often the highest-stakes window — it's disproportionately where real emergencies land, and it's the window where nobody's watching the agent work in real time.\n\nBuild and test it with the same care as the daytime system you're eventually going to pitch, because the client's trust in that pitch is being earned right now.",
    },
  ],
  faq: [
    {
      q: "How does call forwarding to the agent actually work?",
      a: "Conditional call forwarding is standard functionality on most business phone systems and carriers — you set a rule to forward the line after a set number of unanswered rings, or on a schedule tied to business hours. It's a configuration change on the existing phone line, not new hardware or a number swap.",
    },
    {
      q: "What counts as an emergency — who decides?",
      a: "The client decides. A plumber's real emergencies (active flooding, no heat, no working toilet) aren't a locksmith's or an electrician's. Get the client's own list before building the agent, load those specific criteria, and role-play a few real scenarios with them before going live — the agent applies the client's rules, it doesn't invent its own.",
    },
    {
      q: "What happens the next morning?",
      a: "The owner or dispatcher gets a digest: who called, what they needed, and any details the agent gathered, plus a record of anything already booked into next-day slots. Genuine emergencies don't wait for the digest — those trigger an immediate page or SMS to the on-call number the moment the call happens.",
    },
    {
      q: "How is this different from a human answering service?",
      a: "A human answering service like Ruby staffs operators around the clock and bills by the minute allowance — its published plans start at $250/month for 50 minutes and scale up from there for higher volume. An after-hours-only AI agent covers a narrower slice (nights and weekends, not full daytime volume) at BYOK-level running costs, and it's configured specifically to hand off anything genuinely urgent rather than trying to resolve it itself.",
    },
    {
      q: "Do I need to build the full 24/7 receptionist first?",
      a: "No — after-hours-only is a deliberately smaller, lower-risk build you can ship and prove in days. The full daytime-plus-after-hours receptionist is a bigger scope decision the client should make after seeing after-hours results, not before.",
    },
  ],
  sources: [
    {
      label: "Ruby — Virtual Receptionist Pricing",
      url: "https://www.ruby.com/pricing/",
    },
    {
      label: "Twilio — Voice Pricing (US)",
      url: "https://www.twilio.com/en-us/voice/pricing/us",
    },
  ],
};
