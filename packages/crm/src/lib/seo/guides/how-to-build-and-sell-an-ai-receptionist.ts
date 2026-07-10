import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-build-and-sell-an-ai-receptionist",
  title: "How to Build and Sell an AI Receptionist (From First Test Call to Monthly Retainer)",
  description:
    "A builder's walkthrough for turning an AI receptionist into a sellable service: the spec it has to meet, the honest build paths, how to test it before a client ever hears it, and how to price and sell it.",
  targetKeyword: "how to build an ai receptionist",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/ai-receptionist-cost-calculator",
  relatedBest: "/marketplace",
  dek: "Every local business owner already knows what a missed call costs — they've either paid an answering service for years or watched the voicemail box fill up. That makes the AI receptionist the easiest first agent to sell. This is the builder's path: what it has to do, how to build it honestly, how to test it before you demo it, and how to price and operate it across clients.",
  sections: [
    {
      h2: "Why the AI receptionist is the easiest first agent to sell",
      body: "Most agents you could build for a small business require you to first convince the owner they have a problem. The AI receptionist doesn't — every missed call is a visible, dollar-denominated loss the owner already feels: a plumber who was under a sink, a dentist's front desk on the other line, a Friday-at-6pm call nobody was there to take. That's a job that either doesn't get done or goes to a competitor who happened to pick up.\n\nThe other reason it's an easy sell: the buyer already pays for the alternative. They're either paying a human answering service a real monthly bill, or paying nothing and eating the lost jobs silently. Either way you're not introducing a new budget line — you're replacing one they can already name a number for. That's a much shorter sales conversation than pitching something genuinely new.",
    },
    {
      h2: "What it has to actually do to be sellable (the spec)",
      body: "Before you build anything, write the spec down, because \"AI receptionist\" means very different things depending on how much you cut. To be worth selling, it has to: answer 24/7 without the caller noticing a hold-music gap; capture name, callback number, and the reason for the call on every single call, not just the ones that go well; book directly into a real calendar the business actually uses, not a form that emails someone who has to type it in manually; hand off gracefully to a human or a voicemail when it's genuinely unsure, rather than guessing; and log every call somewhere the owner can review it later.\n\nThe anti-hallucination gate belongs in the spec, not as an afterthought: before it confirms anything — a booking time, a callback number, a name it's not sure it heard right — it should read the detail back to the caller and let them correct it. That single habit is the difference between a receptionist a business owner trusts and one they have to double-check.\n\nBe equally clear about what it should never do. Don't let it quote firm prices (\"we don't lock in prices over the phone, someone will confirm on site\" is safer and truer for most trades), and don't let it promise arrival times or availability it can't actually verify against the calendar. A script deep-dive on exactly how to word those boundaries lives in how to write an AI receptionist script — this piece stays focused on getting from zero to a sellable service.",
    },
    {
      h2: "The build: two honest paths",
      body: "The DIY path is real engineering, and it's worth naming plainly rather than hand-waving: telephony via a provider like Twilio, a realtime voice model wired to that telephony layer, a calendar integration that can actually write bookings (not just read availability), and your own guardrails and read-back logic built and tested by hand. None of that is exotic — it's the same shape of stack a lot of production voice apps use — but it's also ongoing maintenance: telephony numbers, model behavior, and calendar APIs all drift, and you own keeping it working after the first client goes live.\n\nThe assembled path — full disclosure, this is our product — is SeldonFrame building a voice receptionist wired to a CRM and a real booking calendar in one conversation, rather than you wiring telephony, model, and calendar together by hand. First workspace is free, it runs on your own model keys (BYOK), and it publishes to a marketplace where you can white-label it for clients. That doesn't make DIY the wrong call — if you want to own every layer of the stack and don't mind the maintenance, build it yourself. If the AI receptionist is a means to a sellable service rather than a project you want to maintain, starting from something already wired together gets you to a first client faster.",
    },
    {
      h2: "Test it before you sell it",
      body: "Do not demo a receptionist you haven't tried to break. Call it yourself at least twenty times with the cases real callers actually produce: a mumbled or unusual name, a caller who asks for two different things in one call, a caller who books a time and then changes their mind mid-call, background noise, a caller who goes quiet and comes back. Note every call where it guessed instead of confirming, or where the read-back step got skipped.\n\nOn top of the manual calls, run it through scripted evals — the same handful of hard scenarios, run repeatedly, checked against a simple pass/fail: did it capture the right details, did it read them back, did it hand off instead of guessing when it should have. Only demo it to a prospect once it survives your own attempts to trip it up. A prospect who catches it failing on their own test call before you've caught it yourself is a lost sale you won't get a second shot at.",
    },
    {
      h2: "Selling it: the demo and the pitch",
      body: "The strongest demo isn't a generic script — it's the AI receptionist configured with the prospect's own business name, hours, and services, answering a call live on the spot. Nothing sells a missed-call story like the prospect watching an actual booking land on their own calendar during the pitch.\n\nAnchor the price against something they can already name: their current answering-service bill if they have one, or an estimate of what missed calls are costing them if they don't — the cost calculator gives you a defensible number to point to instead of guessing out loud. Structure pricing as a setup fee plus a monthly retainer, not a one-time project. The setup fee covers the configuration work (script, calendar wiring, escalation numbers); the retainer covers you keeping it running, reviewing calls, and tuning it — which is real, recurring work, so price it like a service, not a one-time delivery. A full pricing-benchmarks breakdown for agencies lives in how to price an AI receptionist service; if the prospect is actively weighing it against a human answering service, point them to AI receptionist vs. answering service for the head-to-head.",
    },
    {
      h2: "Operating it across clients",
      body: "Once you have more than one client running, the work shifts from building to operating. Each client needs its own configuration — hours, service list, the specific questions worth asking their callers, and a real escalation number for when the receptionist should just get a human on the line. Copying one client's setup onto another without adjusting it is the fastest way to produce a receptionist that sounds like it belongs to a different business.\n\nSend each client a short monthly proof report: calls answered, bookings captured, calls handed off, and a couple of transcript examples. That report is what turns a retainer from \"the thing I'm still paying for\" into \"the thing that's obviously working,\" and it's your best renewal tool. As the relationship matures, adding SMS follow-up — a text after a missed booking attempt, a confirmation text after a call — is usually the next upsell worth offering, since it reuses the same contact data the receptionist already captured.",
    },
  ],
  faq: [
    {
      q: "Do I need to code to build and sell an AI receptionist?",
      a: "It depends on the path. The DIY path — telephony, a realtime voice model, calendar integration, your own guardrails — is real engineering work. An assembled platform like SeldonFrame builds the voice receptionist, CRM, and calendar wiring from a conversation instead, which lowers the technical bar considerably, though configuring it well for each client (script, escalation, hours) is still real work either way.",
    },
    {
      q: "What does it cost to run an AI receptionist?",
      a: "There are two separate cost lines to budget for, and both vary with call volume and provider, so treat any single number as an estimate rather than a quote: telephony (Twilio's US voice pricing runs roughly $0.0085–$0.022 per inbound minute depending on number type, plus a small monthly number fee) and the AI model itself, billed per token/minute depending on the provider. Compare that combined estimate against what a human answering service costs — Ruby, for example, lists virtual-receptionist plans starting around $250/month for 50 minutes — to see where the AI option's margin actually sits for a given client's call volume.",
    },
    {
      q: "What phone number does the AI receptionist use?",
      a: "Typically either a new number provisioned for the client (via a telephony provider) or their existing business number ported or forwarded to the AI system, so callers dial the number they already know. Which option makes sense depends on whether the client wants to keep their existing number listed everywhere (forwarding) or is fine starting fresh.",
    },
    {
      q: "What happens when the AI receptionist can't answer a question?",
      a: "A well-specified receptionist hands off — to voicemail, to a human on an escalation number, or to a callback promise — rather than guessing. That's a spec requirement, not an edge case: any receptionist that answers unclear questions confidently instead of admitting uncertainty is going to eventually promise something the business can't deliver on.",
    },
  ],
  sources: [
    {
      label: "Twilio — Voice Pricing (US)",
      url: "https://www.twilio.com/en-us/voice/pricing/us",
    },
    {
      label: "Ruby — Pricing",
      url: "https://www.ruby.com/pricing/",
    },
  ],
};
