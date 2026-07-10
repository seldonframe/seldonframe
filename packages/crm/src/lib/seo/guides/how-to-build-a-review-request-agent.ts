import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-build-a-review-request-agent",
  title: "How to Build a Review-Request Agent (and Charge Monthly for It)",
  description:
    "A build-and-sell walkthrough for agency owners: the trigger, the compliance rule you can't skip, the DIY vs. assembled build, and how to price a review-request agent as a recurring add-on.",
  targetKeyword: "review request automation",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/google-review-link-generator",
  relatedBest: "/marketplace",
  dek: "Of all the agents you can sell a local business, a review-request agent is the easiest to prove works — the client can literally watch the review count go up on their own Google profile. Here's the spec, the compliance rule that keeps it legal, and how to price it.",
  sections: [
    {
      h2: "Why reviews are the most provable agent ROI you can sell",
      body: "Most agent pitches ask a client to trust a number you report — calls answered, leads qualified, hours saved. A review-request agent doesn't need your report at all. The client opens Google Maps, searches their own business, and sees the review count and the date of the most recent one. That's the whole sales cycle, repeated every month.\n\nIt's provable because review count and recency are the two things buyers actually look at before they call. BrightLocal's 2026 Local Consumer Review Survey found that 97% of consumers read reviews for local businesses, and 85% say positive reviews make them more likely to use a business. An agent that reliably turns finished jobs into review requests is directly working the exact signal a prospective customer checks first — which is why it sells itself once a client sees the before/after on their own profile.",
    },
    {
      h2: "The spec: what the agent actually has to do",
      body: "The trigger is a completed transaction, not a calendar date: invoice paid, booking marked complete, or deal moved to won. Firing off a review request the moment a job wraps — or a sane hour or two later, once the customer has had a moment to be happy rather than mid-task — beats a generic weekly batch every time.\n\nThe message itself is one text or email with a direct review link (no search-and-scroll), sent to every customer who completed the job — not a filtered list. One polite follow-up, a few days later, to anyone who hasn't clicked, and then stop; repeated nagging burns the relationship for the sake of one more review. Unhappy replies need a separate lane entirely: if a customer responds with a complaint instead of clicking the link, that reply should route straight to the owner, not sit in an inbox waiting to become a public one-star review. Track the two numbers that matter — requests sent vs. reviews landed — so the agent's output is a number, not a vibe.\n\nThe rule that isn't optional: Google explicitly prohibits \"discourag[ing] or prohibit[ing] negative reviews, or selectively solicit[ing] positive reviews from customers\" — commonly called review gating — and separately prohibits offering \"payment, discounts, free goods and/or services... in exchange for posting any review.\" A compliant agent asks every customer who completed a job, the same way, with no reward attached. The owner-routing step above exists so unhappy customers get handled directly by a human, not filtered out of the review ask itself — those are two different things, and conflating them is the compliance mistake that gets a Business Profile flagged.",
    },
    {
      h2: "The build: DIY vs. assembled, honestly",
      body: "DIY means wiring three pieces yourself: a webhook or poll on your CRM's job-completion event, an SMS or email send with the review link, and a suppression list so you're not re-texting the same customer on every job. None of that is exotic — most CRMs expose a completed-job or paid-invoice event, and SMS/email sending is a commodity API call. The review link itself is free either way: Google builds it from a business's Place ID, and our google review link generator turns a Place ID or Maps URL into that link plus a QR code in a few seconds with no signup.\n\nThe honest trade-off with DIY: the trigger wiring, the delay logic, the suppression list, and the owner-routing lane are four separate moving pieces to build and keep working across every client's CRM setup — doable, but real ongoing maintenance, especially once you're running it for more than one client.\n\nThe assembled path — full disclosure, this is our product — is SeldonFrame: the trigger, delay, follow-up, suppression, and owner-routing logic ship as one pre-built agent bound to the client's CRM and calendar, so you're configuring a template instead of building the pipeline from scratch. First workspace is free, $29/mo unlocks unlimited workspaces, and you bring your own SMS/email keys (BYOK) so there's no markup on the sending itself. Neither path is wrong — if you already run the CRM webhook plumbing for other automations, DIY is a reasonable afternoon. If you're standing up your fifth client this month, assembled is the one that doesn't eat your week.",
    },
    {
      h2: "Selling it: price the proof, not the plumbing",
      body: "The pitch writes itself because the proof is public: pull up the prospect's Google profile next to a competitor's, and point at review count and how recent the last one is. A business with 40 reviews from the last three months reads as active and trustworthy; one with 12 reviews and the newest one from a year ago reads as maybe-closed. That gap is visible to the prospect without you saying a word.\n\nPrice it as a small flat add-on, not a standalone product — it bundles naturally onto a review-response agent, a receptionist, or a booking agent you're already running for the same client, since it shares the same CRM connection and the same monthly conversation about what the agents did. Resist quoting a specific review-count outcome; promise the process (every completed job gets asked, unhappy ones get routed to the owner first) and let the client's own profile do the closing.",
    },
    {
      h2: "Operating it month to month",
      body: "Keep a short per-client tone template — plumbing and med-spa customers don't want the same text — and a do-not-ask list for anyone mid-dispute, mid-refund, or who's already complained; asking those customers for a review is how a five-star pitch turns into a screenshot of a tone-deaf text. Send a short monthly number to the client: requests sent, reviews landed, and where the rating trend is heading. That's the entire retention story for this agent — no dashboard required, just the same three numbers every month.",
    },
    {
      h2: "Failure modes to design against",
      body: "Review gating — filtering the ask to happy customers only — is the one that can get a Business Profile penalized, not just a bad look; build the trigger to fire on every completed job, full stop. Asking at the wrong moment (mid-task, before the customer has actually experienced the result) gets ignored or, worse, gets a review left in a neutral mood instead of a positive one. Generic, obviously templated copy (\"We'd love your feedback!\") gets skipped at a much higher rate than a message that names the actual job. And repeat customers getting asked after every single visit will eventually opt out of texts from the business entirely — the suppression window should cover the relationship, not just the last request.",
    },
  ],
  faq: [
    {
      q: "Is automated review requesting actually allowed by Google?",
      a: "Yes, with one hard rule: ask every customer who completed the job the same way, with no incentive attached. Google's policy prohibits \"discourag[ing] or prohibit[ing] negative reviews, or selectively solicit[ing] positive reviews\" (review gating) and separately prohibits offering payment or discounts in exchange for a review. An agent that sends the same request to 100% of completed jobs, with no reward, is compliant by design.",
    },
    {
      q: "SMS or email for the review request?",
      a: "SMS gets opened and clicked faster, which matters since the ask has a short window before the moment fades — but it costs more per message than email and needs a number the customer has already texted with. Many builders run SMS as the primary channel and email as the fallback for contacts with no phone on file.",
    },
    {
      q: "What results should I promise a client?",
      a: "Never a specific review count or rating — that's outside anyone's control and promising it is the fastest way to lose trust when it doesn't land exactly. Promise the process: every completed job gets a request, unhappy replies get routed to the owner before they become a public review, and you report the numbers every month.",
    },
    {
      q: "What do I do with a negative reply that comes back from the request?",
      a: "Route it straight to the owner, not to the public review flow — that's a service-recovery conversation, not a review-gating tactic, because the customer still isn't being blocked from leaving a public review if they choose to. Handling the complaint well in that direct channel is often what keeps it from becoming a one-star review at all.",
    },
    {
      q: "How is this different from a review-response agent?",
      a: "A review-request agent runs before a review exists — it's the ask that turns a finished job into a review. A review-response agent runs after, drafting replies to reviews that are already posted. They're commonly sold as a bundle, but they're two different triggers and two different jobs.",
    },
  ],
  sources: [
    {
      label: "BrightLocal — Local Consumer Review Survey 2026",
      url: "https://www.brightlocal.com/research/local-consumer-review-survey/",
    },
    {
      label: "Google Business Profile Help — Prohibited and restricted content policy (review gating and incentives)",
      url: "https://support.google.com/business/answer/2622994",
    },
  ],
};
