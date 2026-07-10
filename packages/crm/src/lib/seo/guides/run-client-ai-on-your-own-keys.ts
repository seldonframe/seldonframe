import type { Guide } from "./types";

export const guide: Guide = {
  slug: "run-client-ai-on-your-own-keys",
  title: "Run Your Clients' AI on Your Own Keys — and Stop Paying Platform Markup",
  description:
    "GoHighLevel bills AI through its own system and won't let you use your own key. Here is why running client AI on your own account protects agency margin.",
  targetKeyword: "gohighlevel bring your own openai key",
  intent: "informational",
  cluster: "gohighlevel",
  relatedTool: "/tools/voice-ai-cost-calculator",
  relatedBest: "/alternative-to-gohighlevel",
  dek: "Most platforms sit between your clients and the AI providers, and that seat is where your margin quietly leaks. Owning the key and the phone number is how you keep client AI at raw provider cost.",
  sections: [
    {
      h2: "How platforms make money on your AI usage",
      body:
        "When you run AI for clients through an all-in-one platform, you are almost never talking to the AI provider directly. The platform holds the account with the model provider, the platform holds the telephony account, and every message, call, and minute flows through its billing system before it reaches you. That middle position is valuable, and platforms are built to capture value from it. There are two ways they do it, and it helps to keep them separate in your head.\n\nThe first is rebilling. The platform meters what your clients use and passes the charge back to you, and you pass it to your client. On its own, rebilling is fair. Somebody has to pay for the SMS segments and the call minutes, and metering them is reasonable. The second lever is markup, and this is where margin leaks. Markup is the platform adding a percentage on top of the real provider cost, or gating the ability to rebill at all behind a higher tier, or charging a flat per-seat AI fee that has nothing to do with actual usage. You can be paying provider cost plus a platform tax and never see the tax broken out on a line item.\n\nThe reason this matters for agencies specifically is scale. One client using a chatbot is a rounding error. Ten clients, each running a voice receptionist and an SMS follow-up sequence and an AI that drafts emails, is real money every month, and the markup compounds silently across all of them. If you never control the underlying account, you never see the raw number, so you cannot tell how much of your bill is cost and how much is toll. The first defense is simply knowing the two levers exist.",
    },
    {
      h2: "GoHighLevel's model: no bring-your-own-key",
      body:
        "GoHighLevel is a capable platform, and to its credit it has moved toward transparency on token pricing. Since roughly October 2025 it passes AI token cost through at provider rates with no extra token markup, according to its own AI product pricing documentation. That is a genuinely fair change on the raw token line, and it is worth acknowledging plainly. But token pass-through is only one piece of what your clients actually run.\n\nThe piece that agencies keep asking about is the key itself. GoHighLevel does not let you bring your own OpenAI or LLM key. This is not a rumor. It is an open, upvoted feature request that has been sitting on GoHighLevel's own public ideas board, where agencies have asked to plug in their own provider key and have not been given the option. Everything still flows through GoHighLevel's account and GoHighLevel's billing. The AI Employee capability is sold as an add-on, reported at around fifty dollars per month per location on the Growth tier or around ninety-seven dollars per location on Unlimited, or alternatively on usage at roughly two to five cents per minute. Voice AI has been reported at around sixteen cents per minute in platform cost, which agencies commonly resell somewhere near forty cents a minute. Treat every one of these figures as reported rather than guaranteed, because add-on pricing changes, but the shape is clear: usage and voice still run through the platform even when tokens are passed through at cost.\n\nSo the honest read on GoHighLevel is mixed. Token cost has gotten fairer. The structural fact has not changed: you cannot use your own key, so you never hold the account that the AI actually runs on. On the flat per-location AI fees, one agency running ten clients on flat-rate AI Employee reported roughly nine hundred seventy dollars a month in AI fees alone. That is reported, and your mileage will vary, but it shows how a per-seat model behaves as you add clients. The number grows with your client list whether or not those clients are heavy users.",
    },
    {
      h2: "Why owning the key and the number matters",
      body:
        "Owning the key is not about wanting to fiddle with API dashboards. It is about three things that decide whether an agency keeps its margin: cost, portability, and lock-in. Take them one at a time.\n\nCost is the obvious one. When the AI runs on your own Anthropic or OpenAI account, you pay the provider's published rate and nothing sits on top of it. There is no per-location seat fee inflating with your client count, and no resale spread built into the minutes. The same is true of telephony when the calls and texts run on your own Twilio account. You pay Twilio's rate. The platform does not get to decide what a minute or a segment is worth to you, because the platform is not the one selling it to you.\n\nPortability and lock-in are the quieter, more important ones. When the account belongs to you, the work you build belongs to you. Your client's phone number is registered to your Twilio, so it moves with you. Your AI configuration runs against your provider key, so it is not trapped inside one vendor's billing relationship. If you ever change platforms, you are not being held in place by the fear of losing numbers and rebuilding integrations from scratch. This is the never-taxes idea in practice: you should not pay a recurring toll for the privilege of using AI you could buy directly, and you should never be financially punished for keeping your options open. A platform that owns your keys owns your leverage. A platform that lets you own your keys is selling you orchestration, not a tollbooth.",
    },
    {
      h2: "What owning your keys looks like in practice",
      body:
        "Here is the concrete version, because the principle is only useful if the setup is simple. On a platform built around your keys, you connect your own AI provider account and your own Twilio account once. From that point, every client workspace you spin up runs its receptionist, its chat, its SMS, and its call handling against your accounts. The tokens bill to your AI provider at provider rate. The minutes and segments bill to your Twilio at Twilio rate. Nothing about the AI usage passes through a platform markup, because the platform is not in the billing path for it.\n\nSeldonFrame is built this way on purpose. The platform charges a flat twenty-nine dollars a month to orchestrate everything, and that fee does not change with how much AI your clients use or how many workspaces you run. Workspaces are unlimited, the first one is free forever, and there is no per-location AI seat to buy because the AI receptionist is the product, not an add-on. Website, CRM, booking, and reviews are all included at that same flat price. You are paying for the software that turns your keys into a finished, client-ready front office, and you are not paying a percentage of your own AI bill on top.\n\nThe spin-up is the part agencies tend to not believe until they see it. A full client workspace, with the AI receptionist configured, the website up, the CRM and booking wired in, comes out of a single conversation in about three minutes. You are not stitching together snapshots or configuring a metering system. You describe the client, the workspace is built, and it runs on the accounts you already own. The orchestration is the paid part. The AI cost stays raw.",
    },
    {
      h2: "The honest trade-off",
      body:
        "There is a real trade-off, and pretending otherwise would be the kind of thing this whole approach is against. When you bring your own key, you technically hold a provider account and a telephony account. That means there is an account somewhere with your name on it, a card on file with Anthropic or OpenAI, and a Twilio balance to keep funded. Someone has to have set those up. A platform that hides all of it behind its own billing genuinely removes that small chore for you.\n\nThe question is what that convenience costs. When the platform holds the key, the chore disappears and so does your visibility, your portability, and a slice of your margin on every client every month. When you hold the key and a good platform does the orchestration, you do the one-time setup of connecting two accounts, and in exchange you keep the raw cost, the portability, and the leverage for as long as you run the agency. For most agencies the math is not close, because the setup happens once and the margin compounds for years.\n\nSo the fair conclusion is not that keys are magic. It is that owning the key is the mechanism, and the benefit is ownership. If you value having a single vendor absorb every operational detail and you are not price-sensitive on AI, GoHighLevel's model may suit you, and its token pass-through makes it fairer than it used to be. If you are an agency that wants to keep the spread on AI you resell and keep your work portable, running client AI on your own keys is how you stop paying a markup you cannot see. The platform should earn its flat fee by making that easy. It should not earn a percentage of your growth.",
    },
  ],
  faq: [
    {
      q: "Can I use my own OpenAI key with GoHighLevel?",
      a: "No. GoHighLevel does not let you bring your own OpenAI or LLM key. It is an open, upvoted request on GoHighLevel's own public ideas board, and the AI still runs through GoHighLevel's account and billing. Since about October 2025 it passes token cost through at provider rates with no extra token markup, but you still cannot connect your own key.",
    },
    {
      q: "Does GoHighLevel mark up AI usage?",
      a: "On raw tokens, GoHighLevel reports passing cost through at provider rates since roughly October 2025, which is fair. The cost that adds up for agencies is the AI Employee add-on, reported at around fifty dollars per location on Growth or ninety-seven on Unlimited, plus voice minutes reported near sixteen cents that agencies resell higher. Treat these as reported figures, since add-on pricing changes.",
    },
    {
      q: "What does bring-your-own-key actually save me?",
      a: "It keeps AI and telephony at raw provider cost with no platform seat fee or resale spread on top, and it keeps your work portable because the accounts and phone numbers are yours. On SeldonFrame the platform charges a flat twenty-nine dollars a month to orchestrate your own keys, so the AI cost you pay is the provider's rate, not a marked-up bill you cannot see inside.",
    },
  ],
  sources: [
    {
      label: "HighLevel — AI Products Pricing",
      url: "https://help.gohighlevel.com/support/solutions/articles/155000006652-ai-product-pricing",
    },
    {
      label: "HighLevel Ideas — Let us use our own OpenAI API Keys",
      url: "https://ideas.gohighlevel.com/conversation-ai/p/let-us-use-our-own-openai-api-keys",
    },
    {
      label: "NetPartners — GoHighLevel Agency Pricing, Costs & Margins",
      url: "https://netpartners.marketing/gohighlevel-agency-pricing-guide/",
    },
  ],
};
