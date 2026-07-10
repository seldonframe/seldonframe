import type { Guide } from "./types";

export const guide: Guide = {
  slug: "voice-ai-reseller-programs",
  title: "Voice AI Reseller Programs: Vapi, Synthflow, Retell — and the Own-the-Stack Alternative",
  description:
    "Reselling voice AI as an agency means picking whose brand, whose margin, and whose customer relationship you're standing on. Here's what Vapi, Synthflow, and Retell AI actually publish, the margin math to run before signing, and the own-the-stack alternative.",
  targetKeyword: "voice ai reseller",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/voice-ai-cost-calculator",
  relatedBest: "/agencies",
  dek: "Every agency owner watching voice AI take off is asking the same question: do you resell someone else's platform, or build your own stack? The answer changes the margin, the ownership, and what happens the day a client asks to leave. Here's what the major voice AI platforms actually publish about reselling, and the math to run before you sign anything.",
  sections: [
    {
      h2: "Why voice is where agencies want to resell",
      body: "The phone is where local-business money already lives. A plumber, a dental office, a law firm — they've been paying for phone answering, one way or another, for decades. Voice AI is the first version of that spend an agency can plausibly sell as a monthly retainer instead of a headcount line.\n\nPer-minute pricing is also what makes the opportunity look so clean on a slide: buy minutes wholesale, sell them retail, keep the spread. That's the pitch behind most \"voice AI reseller\" programs. The part the pitch skips is the question that actually determines whether reselling is a good business: whose brand is on the product the client sees, whose margin survives as the client's call volume grows, and whose customer is it if the platform changes its pricing — or you change platforms.",
    },
    {
      h2: "The reseller/white-label landscape, as of this writing",
      body: "Vapi (vapi.ai/pricing, checked this session) publishes a straightforward developer platform: the Build plan is usage-based at $0.05/min for Vapi's own hosting, plus model-provider costs passed through at actual cost (or free if you bring your own API keys). Ten call-concurrency lines are included, with additional lines at $10/line/month. The Scale plan is an annual contract with a fixed platform fee, custom volume-based per-minute pricing, and enterprise features (SOC 2, HIPAA, PCI, SSO, RBAC). Nothing on the pricing page names a white-label or reseller program — Vapi reads as a developer platform you build on top of, not a program you sign up for as an agency reseller.\n\nSynthflow (synthflow.ai/pricing, checked this session) is more direct about enterprise-scale deals but similarly light on reseller specifics: the only tier with published numbers is Enterprise, starting at $30,000 annually, with the page stating final pricing is \"scoped around call volume, concurrency, telephony setup, integrations, security needs, and launch support.\" No dollar figures or margin terms for a white-label/reseller arrangement are published — you'd need to get on a call to find out what that actually costs and includes.\n\nRetell AI (retellai.com/pricing, checked this session) publishes the most granular per-minute breakdown of the three: pay-as-you-go voice agents run $0.07–$0.31/minute, built from Retell's own voice infrastructure ($0.055/min), text-to-speech ($0.015/min on Retell platform voices), LLM cost ($0.003–$0.32/min depending on model), and telephony (~$0.015/min, varies by country), plus optional add-ons like a knowledge base ($0.005/min) or PII removal ($0.01/min). The page also references a \"Solution Partner Program\" and a \"Creator Partner Program\" by name, but the pricing page itself gives no public margin, fee, or white-label terms for either — a dedicated partner-terms page was not reachable this session, so treat those two programs as named-but-undocumented until you get the details directly from Retell.",
    },
    {
      h2: "The reseller margin math to run before you sign",
      body: "The shape of the math is the same across any per-minute platform: client retainer, minus (platform per-minute cost × minutes used), minus telephony, minus the time you spend building, monitoring, and supporting the agent. At low call volume — a handful of clients, a few hundred minutes a month each — that spread looks generous. A retainer priced against light usage clears a comfortable margin.\n\nThe trap is what happens as a client succeeds. If your pitch works and their call volume triples, your platform cost triples with it, but the retainer you quoted at signing usually doesn't move unless you built re-pricing into the contract. Per-minute markups look best on the deal you're about to close and get worse on every deal that grows — which is exactly the client you want to keep. Before setting a retainer, run the math at 3x and 5x the volume you're pricing against, not just the number the client gives you today. If you haven't modeled that curve for a specific vendor's rates, run it against the /tools/voice-ai-cost-calculator before you quote anyone.",
    },
    {
      h2: "The questions to ask any reseller program before signing",
      body: "Is the dashboard the client sees actually white-label — your logo, your domain, no platform branding anywhere a client or their staff could stumble into it — or is \"white-label\" doing marketing work for a feature that's really just a custom subdomain?\n\nWho owns the phone number and the call/transcript data if the client leaves — you, the platform, or the client directly? A number and a data history that live on the vendor's account, not the client's or yours, means every offboarding is a negotiation.\n\nWhat happens to your per-minute cost as a single client's volume scales — does the rate stay flat, step down, or is it locked at whatever tier you signed at regardless of growth?\n\nIs there a platform fee per client on top of usage (a per-seat or per-agent charge that erodes margin independent of call volume), and can you actually export the agent's configuration — prompts, call flows, integrations — if you decide to migrate a client off the platform later, or is the build locked into that vendor's format with no exit path?",
    },
    {
      h2: "The own-the-stack alternative",
      body: "There are two honest versions of owning the stack instead of reselling. Full DIY means your own Twilio (or equivalent telephony) account, your own realtime-model API keys, and your own orchestration code gluing the two together — maximum margin, because there's no platform markup between you and the raw per-minute costs, but real engineering: you're building and maintaining the call-handling logic, the failover behavior, and the integration surface yourself.\n\nAssembled-but-owned is the middle path: a platform that wires the pieces together but leaves the underlying accounts — telephony and model keys — in your name, so the per-minute costs run at cost rather than through a markup layer, and the client relationship and configuration stay portable. Disclosure, since this is relevant to how you weigh it: SeldonFrame is built this way — voice agents run on your own Twilio account and your own model API keys (BYO-Twilio, BYOK), so per-minute costs pass through at cost with no reseller markup, white-labeled per client, for $29/mo flat rather than a per-minute or per-seat platform fee. Weigh that paragraph as the vendor's own pitch, same as the three programs described above.",
    },
    {
      h2: "Choosing between the two",
      body: "If the goal is selling something this quarter with zero engineering time, a reseller program is a legitimate choice — Vapi, Synthflow, and Retell are all real, working platforms with live customers. Just go in having actually modeled the margin curve at higher volume, and having asked the ownership questions above out loud before you sign, not after a client asks to leave.\n\nIf voice is going to be a core, long-term offer rather than a single line item, owning the stack compounds: every client you add doesn't cost you a platform markup on top of the raw per-minute rate, and every client you keep isn't sitting on infrastructure you don't control. Neither answer is universally correct — it's a question of how much of your agency's future revenue you want running through someone else's pricing page. For the broader shape of white-labeling AI agents beyond just voice, see the /guides/white-label-ai-agents category page.",
    },
  ],
  faq: [
    {
      q: "What does voice AI actually cost per minute to run?",
      a: "It stacks: a voice-platform fee (Vapi's Build plan: $0.05/min; Retell's pay-as-you-go: $0.07-$0.31/min all-in, including its own $0.055/min infrastructure plus TTS and LLM costs), an LLM cost that varies by model, and telephony (Twilio US outbound local: $0.014/min; inbound local: $0.0085/min plus a small monthly number fee — as of this writing, checked this session). Add them up for the specific vendor and model you're using rather than trusting a single headline number; the FAQ-worthy honest answer is \"it depends which platform, which model, and which country,\" not one flat rate.",
    },
    {
      q: "Can I white-label Vapi, Synthflow, or Retell?",
      a: "Their public pricing pages, checked this session, don't spell out white-label reseller terms in detail. Vapi's pricing page names no white-label or reseller program at all. Synthflow's only published tier is Enterprise starting at $30,000/year, with white-label terms (if any) presumably negotiated on that call. Retell references a \"Solution Partner Program\" and a \"Creator Partner Program\" by name but its pricing page gives no public terms for either — you'd need to talk to their sales team to find out what's actually included. Don't assume white-label capability exists at a given tier until you've seen it in writing.",
    },
    {
      q: "What margin should a voice AI retainer target?",
      a: "There's no single honest number here — it depends on your per-minute cost stack, your support overhead, and what the client will actually pay. The useful discipline isn't a target percentage; it's pricing against volume at 3x and 5x what the client uses today, not just today's usage, so a client's growth doesn't quietly erase your margin. Run your specific numbers through /tools/voice-ai-cost-calculator before quoting.",
    },
    {
      q: "Who owns the phone number in a reseller arrangement?",
      a: "It depends entirely on the platform and how the account is set up — ask explicitly before signing, because it's rarely stated up front. If the number lives on the platform's master account rather than one you or the client control directly, moving that client off the platform later means porting a number out of someone else's system, which is slower and sometimes contractually restricted. Confirming number and data ownership before onboarding a client is worth the extra question at signup.",
    },
  ],
  sources: [
    { label: "Vapi — Pricing", url: "https://vapi.ai/pricing" },
    { label: "Synthflow — Pricing", url: "https://synthflow.ai/pricing" },
    { label: "Retell AI — Pricing", url: "https://www.retellai.com/pricing" },
    { label: "Twilio — Voice Pricing (US)", url: "https://www.twilio.com/en-us/voice/pricing/us" },
  ],
};
