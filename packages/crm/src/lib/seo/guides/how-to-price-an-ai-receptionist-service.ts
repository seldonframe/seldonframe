import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-price-an-ai-receptionist-service",
  title: "How to Price Your Agency's AI Receptionist Service (and Keep the Margin)",
  description:
    "A pricing playbook for agencies selling an AI receptionist to local clients: setup fees, monthly retainers, and how to protect the margin platform rebilling eats.",
  targetKeyword: "how to price ai receptionist service",
  intent: "informational",
  cluster: "gohighlevel",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/alternative-to-gohighlevel",
  dek: "Clients do not buy an AI receptionist, they buy never missing a lead. Price it on that value, then make sure the platform underneath does not quietly eat the margin you thought you had.",
  sections: [
    {
      h2: "What clients actually pay for",
      body:
        "The biggest mistake in AI receptionist pricing is selling the technology. Lead with the model, the voice, the integrations, and you invite a feature comparison. That caps your price at what the tooling looks like it should be worth.\n\nThat's the wrong frame. A local-service client doesn't want an AI receptionist. **They want to stop losing money on calls nobody answered.**\n\nThink about what a missed call really costs a plumber, a roofer, a dentist, a law office. When a lead calls and no one picks up, they don't wait. They call the next name on the list, and the job is gone.\n\nOne missed call can be a job worth hundreds or thousands of dollars. An AI receptionist that answers every call, chat, and text — day and night — and turns those conversations into booked appointments isn't a software feature to that client. **It's recovered revenue that was leaking out the door.**\n\nPrice on that value, not on your cost. If the service reliably turns after-hours and overflow leads into booked jobs, its worth is measured against the jobs it saves — not against your monthly platform bill.\n\nThis is the anchor for every number in this playbook: **one booked job usually pays for the whole service, often several times over.**\n\nWhen you and the client both understand that, the conversation changes. It stops being about whether the price is high — it starts being about how many jobs they're currently letting slip. That reframe is what makes healthy pricing possible in the first place.",
    },
    {
      h2: "Setup fee and monthly retainer benchmarks",
      body:
        "Agencies selling done-for-you local services usually price in two parts: a one-time setup fee to get the client live, and a recurring monthly retainer to keep the service running. This structure fits an AI receptionist well. There's real onboarding work up front — configuring how it answers, connecting the calendar, matching the client's brand — and ongoing value in keeping it tuned every day after.\n\nAs rough benchmarks, reported monthly retainers in this space commonly land somewhere around **500 to 2,000 dollars a month**. Reported one-time setup fees are often described in the range of roughly **500 to 3,000 dollars**. Treat both as reported ranges, not rules.\n\nWhere you sit inside those ranges depends on the value of a client's average job, how much you manage on their behalf, and how much competition they face. An agency serving high-ticket clients like law firms or elective medical practices sits at the top without blinking. One serving smaller local trades sits lower.\n\nThe setup fee does more than cover your onboarding hours. It filters for serious clients and protects your cash flow — a client who paid a real setup fee is invested, and far less likely to churn after the first month.\n\nThe retainer is where the relationship lives, so anchor it to outcomes the client feels: calls answered, appointments booked, leads recovered. Frame it as the cost of never missing a lead again, and the specific number inside the reported range becomes far easier for the client to accept.",
    },
    {
      h2: "The margin trap that eats your spread",
      body:
        "Here's where agencies quietly lose money they thought they were making. Your retainer is revenue, not profit. Your profit is the retainer minus what the platform underneath charges you to deliver the service — and on a per-location agency platform, those charges are engineered to climb with every client you add.\n\nIf you don't model this before you price, your spread erodes one client at a time.\n\nWalk through how the costs stack on GoHighLevel as the example. The AI Employee is an add-on billed per location, reported at roughly **50 dollars per location** on the Growth option or about **97 dollars per location** on the Unlimited option. That's a recurring cost that repeats for every single client you onboard.\n\nOn top of it sits usage, *rebilled* per message and per minute: SMS at around 0.0079 dollars per segment, email at about 0.675 dollars per thousand, and calls at roughly 0.014 dollars per minute. A chatty client with high call volume runs up real usage — and that usage is a direct charge against your margin on that account.\n\nThe scale is easy to underestimate until you multiply. One agency running the flat-rate AI Employee across ten clients reported roughly **970 dollars a month** in AI fees alone, before a single text or minute of usage was counted.\n\nThe rebilling rules add a twist worth knowing. On the 297-dollar plan and above, usage is passed through at cost without markup — but on the 497-dollar Agency Pro plan, the rebilling carries a markup.\n\nSo the plan that unlocks the most reselling capability is also the one where the platform takes a cut of the usage you pass along. The trap: per-location AI fees plus usage scale with exactly the thing you want to grow, your client count. **The more you sell, the more the platform takes off the top.**",
      callout: {
        kind: "analogy",
        text: "Rebilling is like a wholesaler handing you the exact per-unit cost to pass on to your customer — except on one specific plan, the platform staples its own markup onto that invoice before it reaches you.",
      },
      diagram: {
        type: "bars",
        title: "GoHighLevel AI Employee — per-location cost",
        unit: "per location / month",
        items: [
          { label: "Growth plan", value: 50, display: "$50/location" },
          { label: "Unlimited plan", value: 97, display: "$97/location" },
        ],
        note: "One agency reported roughly $970/month in AI fees alone across 10 clients — before a single text or minute of usage.",
      },
    },
    {
      h2: "Pricing on a flat platform where the AI runs on your own keys",
      body:
        "Now change the variable that actually drives your margin: the cost of goods underneath the service. If the platform is a flat price instead of a per-location one, and the AI runs on your own keys, the entire per-client cost structure collapses.\n\nOn SeldonFrame the platform is a flat **29 dollars a month** with unlimited workspaces, and the first workspace free forever. Adding your tenth client doesn't add a tenth AI subscription — the per-location fee that stacked to roughly 970 dollars in the earlier example simply doesn't exist here.\n\nThe usage side changes just as much. SeldonFrame runs on your own AI keys and your own Twilio account, so you pay the raw provider cost for calls and messages directly — no platform sitting in the middle marking it up.\n\nThat's the mechanism, not the marketing: because the infrastructure is yours, your *cost of goods* on each client drops close to zero beyond the actual carrier and model charges, which are cents on real usage. The chatty high-volume client that used to threaten your margin on a rebilled platform is now just a few dollars of pass-through cost you control.\n\nDo the arithmetic and the pricing power is obvious. Your retainer stays where the value justifies it — in that reported 500-to-2,000-dollar range depending on the client — but the cost you subtract to find profit is now a flat platform fee plus near-zero usage, instead of a per-location AI subscription plus marked-up rebilling.\n\n**The spread you thought you were selling is the spread you actually keep.** This is the whole point of pricing on a flat, own-keys platform: it doesn't change what the client pays, it changes how much of what they pay survives to become your margin. And because it survives on every client, the model gets stronger as you grow instead of weaker.",
      callout: {
        kind: "analogy",
        text: "Cost of goods is what it actually costs you to deliver one unit of the service — for a coffee shop it's beans and milk; for an AI receptionist it's the AI and carrier charges for that one client's calls and texts.",
      },
      diagram: {
        type: "compare",
        title: "Per-location vs. flat, own-keys platform",
        left: {
          heading: "Per-location platform",
          items: ["$50-97/location AI fee, per client", "Usage rebilled per message and minute", "Markup added on the top plan"],
        },
        right: {
          heading: "Flat, own-keys platform",
          items: ["$29/month flat, unlimited workspaces", "Your own AI keys + your own Twilio", "Usage near raw provider cost"],
        },
      },
    },
    {
      h2: "A simple model you can copy",
      body:
        "Turn all of this into a plan you can quote tomorrow. Start with the setup fee, priced to cover onboarding and filter for serious clients — somewhere in the reported **500-to-3,000-dollar range**, set by how high-value the client's jobs are.\n\nOn SeldonFrame the actual onboarding is fast: a full client workspace with site, CRM, booking, and the AI receptionist is built from one conversation in **about three minutes**. Most of that setup fee is margin rather than labor.\n\nCharge it anyway — it protects your cash flow and your churn, not just your hours.\n\nThen choose a recurring structure. Two shapes cover almost everyone.\n\n**Per-location** is the clean default: one monthly retainer per client business, anchored on the value of never missing a lead, sitting in the reported **500-to-2,000-dollar range** by client value. It's simple to sell and simple to bill.\n\n**Per-seat** is the alternative for larger clients with multiple locations or teams — you price a base plus an amount for each additional workspace or user, letting the retainer scale as the client's operation scales. Pick whichever the client understands faster; a pricing model the client can explain back to you is one they'll actually pay.\n\nWhatever shape you pick, hold two rules underneath it. First, anchor every number to the value delivered — booked jobs and recovered leads — never to your platform cost, so the client compares your price against lost revenue rather than software.\n\nSecond, keep your cost of goods flat and own your infrastructure, so every client you add widens your margin instead of narrowing it.\n\nRetainer in the reported range, setup fee up front, and a flat own-keys platform underneath: that's the whole model. It's not the receptionist that makes it profitable — it's pricing on value while refusing to let the platform tax your growth. Run the numbers on your own client list before you quote, and price from what you keep, not from what you charge.",
      callout: {
        kind: "tip",
        text: "Not sure which shape to pick? Default to per-location — it's the one clients ask fewer questions about, and the one that's easiest for you to bill on autopilot.",
      },
    },
  ],
  faq: [
    {
      q: "How much should I charge for an AI receptionist?",
      a: "Price it on the value of never missing a lead, not on your software cost. Reported monthly retainers for agency-run local services commonly land somewhere around **500 to 2,000 dollars a month**, with the exact number driven by the value of the client's average job and how much you manage for them. A single booked job usually covers the service for the month, so anchor the conversation on the jobs the client is currently losing to missed calls rather than on a feature list.",
    },
    {
      q: "What is a normal setup fee?",
      a: "Reported one-time setup fees in this space are often described in the range of roughly **500 to 3,000 dollars**, treated as a reported range rather than a fixed rule. The fee covers onboarding, filters for serious clients, and protects your cash flow, since a client who paid a real setup fee is far less likely to churn early. On a platform where a full workspace is built from one conversation in about three minutes, most of that fee is margin rather than labor, but charging it still does its job of qualifying the client.",
    },
    {
      q: "How do I keep the margin on AI usage?",
      a: "Watch the platform underneath — that's where the margin leaks. On a per-location agency platform the AI can be an add-on billed per client, reported at roughly **50 or 97 dollars per location**, and usage is rebilled per message and per minute, with the 497-dollar plan adding a markup on top. Those costs scale with every client you add. Running on a flat platform with the AI on your own keys and your own Twilio drops your cost of goods close to raw provider cost, so your retainer stays where the value justifies it and the spread survives to become profit.",
    },
  ],
  sources: [
    {
      label: "NetPartners — GoHighLevel Agency Pricing, Costs & Margins",
      url: "https://netpartners.marketing/gohighlevel-agency-pricing-guide/",
    },
    {
      label: "HighLevel — AI Products Pricing",
      url: "https://help.gohighlevel.com/support/solutions/articles/155000006652-ai-product-pricing",
    },
  ],
};
