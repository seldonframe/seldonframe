import type { Guide } from "./types";

export const guide: Guide = {
  slug: "hidden-gohighlevel-fees",
  title: "7 Hidden GoHighLevel Fees That Aren't in the Sticker Price",
  description:
    "The $97/mo plan is only the start. Here are 7 GoHighLevel costs — AI Employee, usage rebilling, and more — that quietly stack onto your real monthly bill.",
  targetKeyword: "gohighlevel hidden fees",
  intent: "commercial",
  cluster: "gohighlevel",
  relatedTool: "/tools/gohighlevel-cost-calculator",
  relatedBest: "/gohighlevel-pricing",
  dek: "GoHighLevel's advertised plans are only the floor of what you pay. These are the seven costs that quietly stack on top of the sticker price.",
  sections: [
    {
      h2: "Why the sticker price is only the floor",
      body: "GoHighLevel advertises plans starting at $97 per month. That number does a lot of work in getting people to sign up.\n\nWhat the pricing page does not say loudly: several other costs attach to your account once you actually start using it. Some scale with your client count. Some scale with your message and call volume. One is just the time it takes to learn the tool.\n\nNone of these are scams — they're normal for a platform this deep. But they're **easy to miss when you're comparing sticker prices**, and together they can add up to more than the base plan itself.\n\nBelow are seven costs that sit outside the headline price. Read them as a checklist to run before you commit, so the number you plan around is the number you actually pay."
    },
    {
      h2: "Fees 1 and 2 — the AI Employee add-on and per-minute Voice AI",
      body: "The first hidden cost is the **AI Employee**. This add-on answers calls, replies to messages, and books appointments — and it's not included in any base plan.\n\nIt's reported at around $50 per month per location on the Growth option, or around $97 per month per location on the Unlimited option, with a usage route reported near $0.02 to $0.05 per minute. The words *per location* matter: the fee repeats for every client account you attach it to.\n\nThe second cost is the per-minute Voice AI itself. Running an AI voice agent is **metered by the minute** on top of the add-on subscription.\n\nVoice AI is reported at around $0.163 per minute at the platform level, and agencies commonly resell it to clients at around $0.40 per minute. So the same feature carries both a recurring per-location fee and a running per-minute charge, and both climb as your call volume grows.",
      callout: {
        kind: "analogy",
        text: "The AI Employee add-on works like a phone line you rent per desk — you pay a seat fee for every location that has one, on top of the minutes it actually talks."
      },
      diagram: {
        type: "bars",
        title: "AI receptionist cost, GoHighLevel vs. flat",
        unit: "per month (typical single location)",
        items: [
          { label: "AI Employee — Growth", value: 50, display: "~$50/mo/location" },
          { label: "AI Employee — Unlimited", value: 97, display: "~$97/mo/location" },
          { label: "SeldonFrame — flat", value: 29, display: "$29/mo, included" }
        ]
      }
    },
    {
      h2: "Fees 3 and 4 — usage rebilled at cost, and markup locked to the $497 plan",
      body: "The third cost is everyday usage. GoHighLevel **rebills the texts, emails, and calls** your accounts send and receive.\n\nText messages are reported at around $0.0079 per segment, email at around $0.675 per one thousand sends, and calls at around $0.014 per minute, with inbound near $0.0128 and outbound near $0.021. Each charge is tiny, but appointment reminders, follow-ups, review requests, and phone traffic run through thousands of them a month.\n\nThe fourth cost is really a restriction that shapes your margins. Rebilling usage to clients **without markup** is available on the $297 and $497 plans. Rebilling **with your own markup** is only on the $497 SaaS or Agency Pro tier.\n\nSo if you want usage to be a profit center rather than just a cost you recover, you're pushed onto the most expensive plan. The cheaper tiers let you break even on usage, not earn from it."
    },
    {
      h2: "Fees 5 and 6 — annual commitment for the discount, and setup and premium actions",
      body: "The fifth cost is the string attached to the discount. Annual billing gives about two months free, which lands at roughly $81, $248, and $414 per month equivalent across the three tiers.\n\nTo get it, though, you **prepay the entire year up front**. That's money committed in advance whether or not the plan still fits your business several months in — the discount comes bundled with lock-in.\n\nThe sixth cost is the setup and configuration layer. Getting real value out of GoHighLevel usually means importing or buying snapshots, wiring up funnels and workflows, and connecting the pieces together.\n\nPremium or advanced workflow actions and third-party integrations can carry their own charges or paid dependencies on top of the platform. These vary too much to put a single number on, but they're a genuine line item — the more sophisticated your automations, the more of them you tend to accumulate."
    },
    {
      h2: "Fee 7 — the time cost of the learning curve",
      body: "The seventh cost never appears on an invoice, but it's real all the same. GoHighLevel is a broad and deep platform, and that power comes with a learning curve.\n\nMost users are reported to become functional in about **one to three weeks**, with full confidence taking longer than that.\n\nThose weeks are not free. They're hours you spend learning the tool instead of serving clients or selling. If you're paying staff to ramp up, that's payroll spent on training rather than delivery.\n\nTo be fair, the depth that creates the learning curve is also what makes GoHighLevel powerful once you're through it. But time to value is a cost like any other, and it belongs in the total when you compare it against simpler tools.",
      callout: {
        kind: "tip",
        text: "Before you buy, ask a rep or a current user for their honest time-to-competent number — not the marketing page's. If it's measured in weeks, budget those weeks as a real cost, not a rounding error."
      }
    },
    {
      h2: "The flat-priced alternative that avoids the stack",
      body: "SeldonFrame is built so most of these seven costs never appear. It's $29 per month, flat, with unlimited workspaces and client sub-accounts, the first workspace free forever, no trial gate, and cancel anytime.\n\nThe AI receptionist that GoHighLevel sells as a per-location add-on is the **core product here and is included**, along with the website, CRM, booking, reviews, client portal, and custom domains.\n\nThe reason there's no per-location AI fee and no resold per-minute markup is the mechanism underneath. SeldonFrame runs on your own AI keys — Claude, ChatGPT, or Gemini — and your own Twilio, so AI and telephony bill at **raw provider cost with no platform markup**.\n\nA full client workspace — site, CRM, booking, and a live agent — is generated from one conversation in about three minutes, which also flattens the setup and learning cost. One booked job usually covers the month.\n\nThis doesn't make GoHighLevel the wrong choice for everyone. Its funnel builder, its large library of templates and snapshots, its deep email and SMS campaign automation, and its big community are real strengths. A funnel-heavy agency with the budget and time to master the platform can get enormous value from it.\n\nThe point of listing the seven fees isn't to say the platform is bad. It's to make sure you plan around the real total — see the [full cost breakdown](/guides/how-much-does-gohighlevel-cost) and whether the [AI Employee is worth it](/guides/is-gohighlevel-ai-employee-worth-it) for your case. If what you mainly want is a branded AI front office per client, a flat $29 platform gets you there without the stack."
    }
  ],
  faq: [
    {
      q: "Does GoHighLevel have hidden fees?",
      a: "Not hidden in a dishonest sense, but there are several costs beyond the advertised plan price. The main ones: the **AI Employee add-on** billed per location, per-minute Voice AI, usage rebilling for texts, email, and calls, markup rebilling locked to the $497 plan, the up-front annual commitment needed for the discount, setup and premium workflow actions, and the time cost of the learning curve. Together these can exceed the base plan — budget for the full stack, not just the sticker price."
    },
    {
      q: "Is the AI receptionist extra?",
      a: "On GoHighLevel, yes. The AI Employee is an add-on charged on top of your base plan — reported at around $50 per month per location on the Growth option, or around $97 per month per location on the Unlimited option — and it repeats for every client location. On SeldonFrame the **AI receptionist is the core product**, included in the flat $29 per month price with no per-location add-on."
    },
    {
      q: "How do I avoid usage-based surprises?",
      a: "The surprises come from metered charges for texts, email, calls, and AI minutes that scale with volume and, on GoHighLevel, are often resold with markup. To avoid them, choose a platform where AI and telephony run at **raw provider cost with no platform markup**. SeldonFrame does this by running on your own AI keys and your own Twilio account, so you pay providers directly and the platform fee stays flat at $29 per month regardless of usage."
    }
  ],
  sources: [
    { label: "GoHighLevel — Pricing", url: "https://www.gohighlevel.com/pricing" },
    {
      label: "HighLevel — AI Products Pricing",
      url: "https://help.gohighlevel.com/support/solutions/articles/155000006652-ai-product-pricing"
    },
    {
      label: "HighLevel — Pricing & Billing: Wallets, Charges, Rebilling",
      url: "https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide"
    },
    {
      label: "Ruzuku — GoHighLevel Pricing: Plans, Add-Ons & Hidden Costs",
      url: "https://www.ruzuku.com/compare/gohighlevel-pricing"
    }
  ]
};
