import type { Guide } from "./types";

export const guide: Guide = {
  slug: "what-is-byok-ai",
  title: "What Is BYOK in AI? Bring-Your-Own-Key, Explained (and Why It Changes Agent Economics)",
  description:
    "BYOK (bring your own key) means the software calls the AI model with your own API key, so you pay the provider's rate and the software charges only for the software. Here's what that changes.",
  targetKeyword: "byok ai",
  intent: "informational",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/marketplace",
  dek: "BYOK is one of those terms that gets thrown around without a definition attached. Here is the plain one, the actual numbers behind it, and the honest trade-offs — including the cases where it is not the right call.",
  sections: [
    {
      h2: "The definition",
      body:
        "*BYOK* — **bring your own key** — means the software you use calls the AI model provider (Anthropic, OpenAI, whoever) with an API key that belongs to you, not to the software vendor. You create the account with the model provider. You fund it.\n\nEvery request the software makes on your behalf bills to that account, at the provider's published rate. The software itself charges you separately — for the orchestration, the interface, the workflow. Not for the tokens.\n\nContrast that with *bundled or markup pricing*, which is how most SaaS platforms sell AI today: a per-message fee, a per-minute rate, a pool of \"AI credits\" included in a plan tier or sold as an add-on. Here the platform holds the provider account and meters what you use.\n\nIt charges you a price that sits above the provider's real cost — sometimes by a little, sometimes by a lot — usually without the raw number ever showing up on your invoice. BYOK and bundled pricing are just **two different places for the same dollar to end up**: straight to the model provider, or routed through the platform first, with the platform keeping the spread.",
      callout: {
        kind: "analogy",
        text: "BYOK is paying the electric company directly for the power you used. Bundled pricing is paying your landlord a flat \"utilities included\" fee that already has their markup baked into the rent — convenient, but you never see the real number.",
      },
      diagram: {
        type: "compare",
        title: "Where the same dollar ends up",
        left: {
          heading: "BYOK",
          items: [
            "Your API key, your provider account",
            "Bills at the provider's published rate",
            "Software charges only for orchestration",
          ],
        },
        right: {
          heading: "Bundled / markup pricing",
          items: [
            "Vendor holds the provider account",
            "Vendor meters your usage",
            "Price sits above real provider cost, hidden",
          ],
        },
      },
    },
    {
      h2: "The economics, with real numbers",
      body:
        "It helps to see what raw model usage actually costs before comparing it to anything marked up. Anthropic's published API pricing (verified against its own pricing docs) lists Claude Sonnet 5 at **$2 per million input tokens and $10 per million output tokens** through August 2026.\n\nClaude Haiku 4.5 — the smaller, faster model many production workloads use — runs **$1 per million input tokens and $5 per million output tokens**. Anthropic's own worked example puts this in a business context directly: processing 10,000 customer support tickets at roughly 3,700 tokens each on Haiku 4.5 costs about **$37 total**, or well under half a cent per conversation.\n\nThat is the shape BYOK pricing takes at small-business volume: raw model cost is a rounding error, often single digits of dollars a month for a business fielding hundreds of conversations.\n\nNow compare that to a bundled structure. GoHighLevel's published pricing (verified against its own pricing page) sells its AI Employee add-on at **$50 per month per sub-account** on the Growth tier, or **$97 per month per sub-account** on the Unlimited tier — a flat fee charged per client workspace, independent of how many tokens that workspace actually consumes.\n\nRun ten client sub-accounts on the Growth add-on and the AI line alone is **$500 a month**, whether those ten clients combined use $5 or $500 of real model usage that month. That is the structural difference: BYOK bills you close to the marginal cost of the request; a per-seat AI add-on bills you a fixed toll per seat, and the toll doesn't shrink because your actual usage was light.",
      diagram: {
        type: "bars",
        title: "GoHighLevel's AI Employee add-on — flat, per sub-account",
        unit: "per month, per sub-account",
        items: [
          { label: "Growth tier", value: 50, display: "$50/mo/sub-account", domain: "gohighlevel.com" },
          { label: "Unlimited tier", value: 97, display: "$97/mo/sub-account", domain: "gohighlevel.com" },
        ],
        note: "Flat regardless of how many tokens that sub-account actually uses.",
      },
    },
    {
      h2: "The trade-offs, honestly",
      body:
        "BYOK is not free of downsides, and pretending otherwise would undercut the whole point of explaining it plainly. The case for it: **cost transparency** — you see the provider's real rate, not a number a vendor chose. No markup sitting between you and the model. Control over which model and rate limits you're running against. And **portability** — the account is yours, so it moves with you if you ever change software.\n\nThe case against it, just as real: you now manage the key yourself. Someone has to create the provider account, put a card on file, set a spend cap, and rotate the key if it's ever exposed.\n\nBilling is split across two parties instead of one — a software bill and a separate model-provider bill — which is one more thing to reconcile monthly. For a genuinely non-technical buyer, a single bundled bill from one vendor is simpler to reason about than two accounts, even if it costs more.\n\nBundled pricing is not a scam. For a buyer who values one invoice and zero setup over five dollars a month in raw token cost, it is a reasonable, even correct, choice.",
      callout: {
        kind: "warning",
        text: "BYOK moves the key-management risk onto you. Skip the spend cap or forget to revoke a key when a client relationship ends, and there's no vendor safety net catching the bill before it lands.",
      },
    },
    {
      h2: "BYOK for agent builders specifically",
      body:
        "This matters more once you are not the only user of the AI — once you are [building and selling agents](/guides/how-much-to-charge-for-an-ai-agent) to clients. If your platform cost is flat and your model cost runs through your own key at provider rate, adding another client adds their raw token cost — often a few dollars a month — and nothing else.\n\nYour margin on that client is whatever you charge them, minus a cost close to zero.\n\nThe per-sub-account alternative inverts that. Every client you add carries a fixed AI-seat fee straight to the platform vendor's revenue line, regardless of how light or heavy that client's actual usage is.\n\nGrowth, in that model, is mostly growth for the vendor's recurring fee — your own margin compounds slower because a chunk of every new client's bill was never yours to keep. **BYOK is the mechanism that keeps a builder's growth curve and a builder's margin curve pointed the same direction.**",
    },
    {
      h2: "Key security and hygiene basics",
      body:
        "None of the cost argument matters if the key itself is handled carelessly, so the basics are worth stating plainly. [Use a separate key per client](/guides/run-client-ai-on-your-own-keys) or workspace rather than one shared key across everything you run — a leak or a runaway workload then stays contained to one account instead of taking down every client at once.\n\nSet a **spend cap** at the provider on every key you create. Rotate or revoke a key the moment a client relationship ends, not \"eventually.\"\n\nAnd never hardcode a key into source code, a config file that gets committed, or a message to a teammate — Anthropic's own API key documentation is explicit that keys should be treated as credentials, stored in environment variables or a secrets manager, and never checked into version control.",
      callout: {
        kind: "analogy",
        text: "A spend cap is a credit card limit for your API key — it doesn't stop a bug or a leak from happening, but it turns a five-hundred-dollar surprise into a five-dollar one.",
      },
    },
    {
      h2: "Where SeldonFrame fits",
      body:
        "Disclosure up front: we build SeldonFrame, so read this paragraph as the sales pitch it partly is. BYOK is the mechanism behind SeldonFrame's flat $29/mo pricing — unlimited workspaces, first workspace free — because the platform never resells tokens.\n\nEvery workspace runs on the operator's own model-provider key at provider rate, the same way telephony runs on BYO-Twilio at Twilio's rate rather than a marked-up per-minute fee. SeldonFrame only takes a cut when it is the sales channel bringing the buyer — a *GMV fee* that steps down from 5% to 2% with volume — not on the AI usage itself.\n\nThat is the trade this whole article describes, applied to one product: the platform gets paid for orchestration, the model provider gets paid for tokens, and nothing sits in between marking up the difference.",
    },
  ],
  faq: [
    {
      q: "Is BYOK actually cheaper than bundled AI pricing?",
      a: "Usually, at typical small-business volume — Anthropic's own worked example puts 10,000 support-style conversations on Haiku 4.5 at about $37 total, versus a flat per-seat AI add-on like GoHighLevel's $50-$97/month regardless of usage. The caveat: at very high, sustained volume, or for a buyer who values one simple bill over five dollars saved, bundled pricing can be the better fit — the savings are real but not universal.",
    },
    {
      q: "Is it safe to give software my AI provider API key?",
      a: "It's the same trust question as giving any software a credential: create a key scoped to that one integration if the provider supports it, set a spend cap at the provider, and revoke the key if you stop using the software. A reputable platform stores it server-side, never displays it back to you in full, and never asks you to paste it somewhere insecure. Treat a request for your key with the same scrutiny you'd give a request for a database password.",
    },
    {
      q: "What's the difference between BYOK and \"AI credits\" or token-based pricing?",
      a: "Credits and token bundles are still the platform's account behind the scenes — you're buying a pool of usage from the vendor at whatever markup they've built into the credit price, and the vendor is still the one paying the model provider. BYOK removes that middle step entirely: your key, your provider account, your bill at the provider's own rate.",
    },
    {
      q: "Can a non-technical person actually set up BYOK?",
      a: "Creating a provider API key is usually a few clicks in a console and doesn't require writing code. The part that takes a little more comfort is treating it like a credential — funding the account, setting a spend cap, and knowing where to paste it once into the software you're connecting it to. Most BYOK-native platforms walk you through that single step rather than assuming prior experience.",
    },
  ],
  sources: [
    {
      label: "Anthropic — Claude API Pricing",
      url: "https://platform.claude.com/docs/en/about-claude/pricing",
    },
    {
      label: "GoHighLevel — Pricing (AI Employee add-on)",
      url: "https://www.gohighlevel.com/pricing",
    },
  ],
};
