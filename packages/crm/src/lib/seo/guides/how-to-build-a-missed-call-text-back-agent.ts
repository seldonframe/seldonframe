import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-build-a-missed-call-text-back-agent",
  title: "How to Build a Missed-Call Text-Back Agent (and Sell It on a Retainer)",
  description:
    "A missed-call text-back agent is the easiest AI agent to sell: cheap to build, instant to demo, and the ROI story is the prospect's own missed calls. Here's the spec, the build, and how to price it as a retainer.",
  targetKeyword: "how to build a missed call text back agent",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/missed-call-calculator",
  relatedBest: "/marketplace",
  dek: "If you build and sell AI agents for a living, this is the one to lead with. It's the cheapest agent to build, the fastest to demo — call the number, hang up, watch the text arrive — and the pitch writes itself using the prospect's own missed-call count. Here's how to spec it, build it, and turn it into a monthly retainer.",
  sections: [
    {
      h2: "Why this is the easiest agent to sell",
      body: "We've covered what a missed-call text-back actually does elsewhere. Short version: it auto-texts anyone whose call goes unanswered, so a missed ring becomes a conversation instead of a dead end.\n\nThat's the buyer-side pitch. This page is the builder-side one — how you actually put it together and get paid for it.\n\nThree things make this the **first agent most builders should sell**. It's cheap to build: a webhook, a text send, a small amount of reply-handling logic, and a place to log the conversation.\n\nIt's also instantly demonstrable — almost nothing else in this category works this way. You hand the prospect your phone, they call your number, you don't answer, and a text lands in their hand within seconds. No slide deck required.\n\nAnd the **ROI argument uses the prospect's own numbers** — how many calls did your front desk not pick up last month? — instead of an industry-average stat you'd have to defend.",
    },
    {
      h2: "The spec that actually makes it work",
      body: "The trigger is a **missed or unanswered call** on the business line. The response is an SMS sent within seconds, from the same number the caller just dialed.\n\nThe text names the business and asks a real question. Not \"we'll call you back\" — something like \"Sorry we missed you! This is [Business]. What do you need? We'll text you right back.\"\n\nA generic acknowledgment does less work than a message that invites the caller to just keep typing.\n\nThe reply needs somewhere to go. Capture it into a CRM record tied to that phone number, and notify the business owner or front desk that a live conversation is happening.\n\nEscalate to a human immediately once the exchange needs a real answer — pricing negotiation, a complaint, anything outside a narrow script. **The agent's job is to acknowledge, capture, and hand off — not to close.**\n\nHere's the detail most \"how missed-call text-back works\" articles skip: in the US, sending SMS from a business number at any real volume requires *A2P 10DLC registration* with the carriers.\n\nTwilio describes A2P 10DLC as the standard carriers use so application-to-person SMS traffic over long-code numbers is verified and consensual. Original long codes were built for person-to-person texting — unregistered traffic gets rate-limited or filtered outright.\n\nThis isn't optional paperwork. **It's the operational gate that determines whether your client's texts actually reach anyone.** Build the registration step into onboarding, not as an afterthought once messages start silently failing.",
      callout: {
        kind: "analogy",
        text: "*A2P 10DLC registration* is kind of like getting verified before a bulk-mail permit — skip it, and your texts get treated as junk by the carriers no matter how good the message is.",
      },
      diagram: {
        type: "flow",
        title: "What happens in the seconds after a missed call",
        steps: [
          { label: "Call missed" },
          { label: "Instant text", sub: "sent within seconds" },
          { label: "Reply captured in CRM" },
          { label: "Owner notified" },
        ],
      },
    },
    {
      h2: "The build: DIY vs. assembled, both paths honest",
      body: "DIY, the pieces are: a missed-call webhook from your telephony provider (Twilio's Voice API supports this natively), an SMS send triggered off that webhook, a small model or rules engine to handle the reply thread within a tightly scoped script, and a CRM write so the conversation doesn't evaporate.\n\nTwilio's own published US pricing has outbound and inbound SMS at **$0.0083 per segment**, with MMS higher (**$0.022 outbound**). Messaging cost is rarely the constraint — the registration and reply-handling logic are.\n\nPlan for the A2P 10DLC brand and campaign registration up front. It's a real step with carrier review involved, not a toggle you flip and move on from.\n\nThe compliance rules apply regardless of which path you take. Register the brand and campaign before sending live traffic.\n\nHonor STOP/opt-out replies immediately and permanently — this is a **carrier requirement, not a nice-to-have**. And respect quiet hours: don't fire the same instant, three-question text thread at 2 a.m. just because a call happened to come in then.\n\nAssembled — disclosure: SeldonFrame is our product. A missed-call text-back agent ships as one of the built-in agent templates, wired to the workspace's CRM and phone number, with the reply-capture and escalation logic already built.\n\nFirst workspace is free. It's *BYOK*, so you're not paying us a markup on the model calls, and $29/mo flat covers unlimited workspaces once you're past the first.\n\nWhether that's worth it versus DIY depends on how many of these you're planning to build and resell. **One client, DIY is fine. A dozen clients, the assembled path is less repeated setup work per client.**",
      diagram: {
        type: "bars",
        title: "Twilio US messaging cost, per segment",
        items: [
          { label: "SMS (inbound / outbound)", value: 0.0083, display: "$0.0083", domain: "twilio.com" },
          { label: "MMS (outbound)", value: 0.022, display: "$0.022", domain: "twilio.com" },
        ],
        note: "Twilio's published US pricing — messaging cost is rarely what makes or breaks this build; A2P 10DLC registration and reply-handling logic are.",
      },
    },
    {
      h2: "Turning it into recurring revenue",
      body: "Don't sell this as a one-time setup fee if you can help it. Bundle it with a weekly missed-call report — how many calls came in after hours, how many texts converted to booked conversations — and price the pair as a **flat monthly retainer**.\n\nThe report is what keeps the client opening the invoice. It's proof the thing is working, delivered on a cadence, without you doing manual work each week.\n\nThe natural upsell, once a client trusts the missed-call agent, is the full AI receptionist — answering calls live, not just catching the ones that get missed.\n\nThe missed-call agent is the **low-risk foot in the door**. It only touches calls nobody was going to answer anyway, so there's nothing to lose by trying it.\n\nOnce the client has watched it work for a month, the conversation about handling live calls too is much easier to have.",
    },
    {
      h2: "The demo-driven sale",
      body: "Open the pitch meeting with the missed-call calculator, plugged in with the **prospect's own estimated missed-call volume** — not an industry average, their number.\n\nThen, in the same meeting, call your own demo line, let it ring out, and hand them your phone as the text arrives.\n\nThat sequence — their number, then a live demo — **collapses the sales cycle** more than almost anything else in the catalog. There's no leap of faith involved. They watched it happen on a real phone in real time.",
    },
    {
      h2: "Failure modes to avoid",
      body: "**Sending SMS before A2P 10DLC registration is complete** is the most common way this breaks. Carriers filter or block unregistered traffic, so the client's texts silently stop arriving.\n\nYou find out from an angry phone call instead of a dashboard alert. Register first, go live second.\n\nThe second failure mode is **scope creep in the reply-handling logic**. An agent that tries to answer complex questions instead of acknowledging, capturing, and handing off will eventually say something wrong to a customer.\n\nKeep its job narrow on purpose. It's a fast, polite intake step, not a full receptionist — pretending otherwise is how a cheap, reliable agent turns into a support ticket.\n\nThe third is forgetting after-hours behavior entirely. A text that fires at 2 a.m. asking a stream of qualifying questions reads as spam, not service.\n\nDecide up front what happens outside business hours — a shorter message, a delayed follow-up, or a note that a human will respond in the morning. Build that branch in rather than letting the same script run around the clock.",
    },
  ],
  faq: [
    {
      q: "What does A2P 10DLC registration actually involve, and how long does it take?",
      a: "It's a two-step process — registering a Brand (the business) and a Campaign (what you're texting about and why) — with the carriers reviewing both before your traffic is treated as verified. Twilio's own documentation on the process doesn't publish a fixed timeline, so budget real business days for review rather than assuming it's instant, and build it into onboarding before you promise a client a go-live date.",
    },
    {
      q: "Can this work with the client's existing phone number?",
      a: "Yes, in most setups — the missed-call trigger and the text-back both run through the number the client already advertises, so callers don't notice anything changed except that a reply now shows up. The number typically needs to be capable of SMS (or ported/connected through your telephony provider) and registered for A2P 10DLC before you send at volume.",
    },
    {
      q: "What happens if the caller texts back something the agent can't handle?",
      a: "That's exactly why the spec calls for a narrow scope and a clear escalation path: the agent acknowledges and captures the reply, and anything outside its script — pricing negotiation, a complaint, a question it isn't confident answering — gets flagged to a human immediately rather than the agent guessing. A missed-call agent that tries to answer everything is a liability; one that knows when to hand off is the reliable version.",
    },
    {
      q: "How is this different from a basic auto-reply or voicemail greeting?",
      a: "An auto-reply or voicemail asks the caller to do more work — leave a message, wait, hope for a callback — while a missed-call text-back starts a two-way conversation within seconds, on a channel most people check faster than voicemail. It also captures the reply into a CRM and can escalate to a human, which a static voicemail greeting has no way to do.",
    },
  ],
  sources: [
    {
      label: "Twilio — US SMS & MMS pricing",
      url: "https://www.twilio.com/en-us/sms/pricing/us",
    },
    {
      label: "Twilio Docs — A2P 10DLC compliance overview",
      url: "https://www.twilio.com/docs/messaging/compliance/a2p-10dlc",
    },
  ],
};
