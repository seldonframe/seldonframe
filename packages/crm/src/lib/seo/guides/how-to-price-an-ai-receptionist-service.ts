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
        "The mistake that wrecks AI receptionist pricing is selling the technology. When you lead with the model, the voice, the integrations, you invite the client to compare features and haggle on cost, and you cap your price at what the tooling looks like it should be worth. That is the wrong frame. A local-service client does not want an AI receptionist. They want to stop losing money to calls they never answered.\n\nThink about what a missed call actually costs the businesses you serve. A plumber, a roofer, a dentist, a law office. When a lead calls and no one picks up, that lead does not wait, they call the next name on the list, and the job is gone. One missed call can be a job worth hundreds or thousands of dollars. An AI receptionist that answers every call, every chat, and every text, day and night, and turns those conversations into booked appointments is not a software feature to that client. It is recovered revenue that was leaking out the door.\n\nPrice on that value, not on your cost. If the service reliably turns after-hours and overflow leads into booked jobs, its worth to the client is measured against the jobs it saves, not against your monthly platform bill. This is the anchor for every number in this playbook: one booked job usually pays for the whole service, often several times over. When you and the client both understand that, the conversation stops being about whether the price is high and starts being about how many jobs they are currently letting slip. That reframe is what makes healthy pricing possible in the first place.",
    },
    {
      h2: "Setup fee and monthly retainer benchmarks",
      body:
        "Agencies selling done-for-you local services tend to price in two parts: a one-time setup fee to get the client live, and a recurring monthly retainer to keep the service running and managed. This structure fits an AI receptionist well, because there is real onboarding work up front, configuring how it answers, connecting the calendar, matching the client's brand, and then ongoing value in keeping it tuned and answering every day after.\n\nAs rough benchmarks, reported monthly retainers in this space commonly land somewhere around 500 to 2,000 dollars a month, and reported one-time setup fees are often described in the range of roughly 500 to 3,000 dollars. Treat those as reported ranges, not rules. Where you sit inside them depends on the value of a client's average job, how much you manage on their behalf, the size of the market, and how much competition they face. An agency serving high-ticket clients like law firms or elective medical practices sits at the top of those ranges without blinking, while one serving smaller local trades sits lower.\n\nThe setup fee does more than cover your onboarding hours. It filters for serious clients and it protects your cash flow, since a client who paid a real setup fee is invested and far less likely to churn after the first month. The retainer is where the relationship lives, so anchor it to outcomes the client feels, calls answered, appointments booked, leads recovered, rather than to a list of features. When the retainer is framed as the cost of never missing a lead again, the specific number inside the reported range becomes far easier for the client to accept.",
    },
    {
      h2: "The margin trap that eats your spread",
      body:
        "Here is where agencies quietly lose the money they thought they were making. Your retainer is your revenue, but it is not your profit. Your profit is the retainer minus what the platform underneath charges you to deliver the service, and on a per-location agency platform those charges are engineered to climb with every client you add. If you do not model this before you price, your spread erodes one client at a time.\n\nWalk through how the costs stack on GoHighLevel as the example. The AI Employee is an add-on billed per location, reported at roughly 50 dollars per location on the Growth option or about 97 dollars per location on the Unlimited option. That is a recurring cost that repeats for every single client you onboard. On top of it sits usage, rebilled per message and per minute: SMS at around 0.0079 dollars per segment, email at about 0.675 dollars per thousand, and calls at roughly 0.014 dollars per minute. A chatty client with high call volume runs up real usage, and that usage is a direct charge against your margin on that account.\n\nThe scale of it is easy to underestimate until you multiply. One agency running the flat-rate AI Employee across ten clients reported roughly 970 dollars a month in AI fees alone, before a single text or minute of usage was counted. And the rebilling rules add a twist worth knowing: on the 297-dollar plan and above the usage is passed through at cost without markup, but on the 497-dollar Agency Pro plan the rebilling carries a markup. So the plan that unlocks the most reselling capability is also the one where the platform takes a cut of the usage you pass along. The trap is that per-location AI fees plus usage scale with exactly the thing you want to grow, your client count, so the more you sell, the more the platform takes off the top.",
    },
    {
      h2: "Pricing on a flat platform where the AI runs on your own keys",
      body:
        "Now change the variable that actually drives your margin: the cost of goods underneath the service. If the platform is a flat price instead of a per-location one, and if the AI runs on your own keys, the entire per-client cost structure collapses. On SeldonFrame the platform is a flat 29 dollars a month with unlimited workspaces and the first workspace free forever, so adding your tenth client does not add a tenth AI subscription. The per-location fee that stacked to roughly 970 dollars in the earlier example simply does not exist here.\n\nThe usage side changes just as much. SeldonFrame runs on your own AI keys and your own Twilio account, so you pay the raw provider cost for calls and messages directly, with no platform sitting in the middle marking it up. That is the mechanism, not the marketing: because the infrastructure is yours, your cost of goods on each client drops close to zero beyond the actual carrier and model charges, which are cents on real usage. The chatty high-volume client that used to threaten your margin on a rebilled platform is now just a few dollars of pass-through cost you control.\n\nDo the arithmetic and the pricing power is obvious. Your retainer stays where the value justifies it, in that reported 500-to-2,000-dollar range depending on the client, but the cost you subtract to find profit is now a flat platform fee plus near-zero usage instead of a per-location AI subscription plus marked-up rebilling. The spread you thought you were selling is the spread you actually keep. This is the whole point of pricing on a flat, own-keys platform: it does not change what the client pays, it changes how much of what they pay survives to become your margin. And because it survives on every client, the model gets stronger as you grow instead of weaker.",
    },
    {
      h2: "A simple model you can copy",
      body:
        "Turn all of this into a plan you can quote tomorrow. Start with the setup fee, priced to cover onboarding and to filter for serious clients, somewhere in the reported 500-to-3,000-dollar range and set by how high-value the client's jobs are. On SeldonFrame the actual onboarding is fast, since a full client workspace with site, CRM, booking, and the AI receptionist is built from one conversation in about three minutes, so most of that setup fee is margin rather than labor. Charge it anyway, because it protects your cash flow and your churn, not just your hours.\n\nThen choose a recurring structure, and two shapes cover almost everyone. Per-location is the clean default: one monthly retainer per client business, anchored on the value of never missing a lead, sitting in the reported 500-to-2,000-dollar range by client value. It is simple to sell and simple to bill. Per-seat is the alternative for larger clients with multiple locations or teams, where you price a base plus an amount for each additional workspace or user, letting the retainer scale as the client's operation scales. Pick whichever the client understands faster, because a pricing model the client can explain back to you is one they will actually pay.\n\nWhatever shape you pick, hold two rules underneath it. First, anchor every number to the value delivered, booked jobs and recovered leads, never to your platform cost, so the client is comparing your price against lost revenue rather than against software. Second, keep your cost of goods flat and own your infrastructure, so that every client you add widens your margin instead of narrowing it. Retainer in the reported range, setup fee up front, and a flat own-keys platform underneath: that is the whole model. It is not the receptionist that makes it profitable, it is pricing on value while refusing to let the platform tax your growth. Run the numbers on your own client list before you quote, and price from what you keep, not from what you charge.",
    },
  ],
  faq: [
    {
      q: "How much should I charge for an AI receptionist?",
      a: "Price it on the value of never missing a lead, not on your software cost. Reported monthly retainers for agency-run local services commonly land somewhere around 500 to 2,000 dollars a month, with the exact number driven by the value of the client's average job and how much you manage for them. A single booked job usually covers the service for the month, so anchor the conversation on the jobs the client is currently losing to missed calls rather than on a feature list.",
    },
    {
      q: "What is a normal setup fee?",
      a: "Reported one-time setup fees in this space are often described in the range of roughly 500 to 3,000 dollars, treated as a reported range rather than a fixed rule. The fee covers onboarding, filters for serious clients, and protects your cash flow, since a client who paid a real setup fee is far less likely to churn early. On a platform where a full workspace is built from one conversation in about three minutes, most of that fee is margin rather than labor, but charging it still does its job of qualifying the client.",
    },
    {
      q: "How do I keep the margin on AI usage?",
      a: "Watch the platform underneath, because that is where the margin leaks. On a per-location agency platform the AI can be an add-on billed per client, reported at roughly 50 or 97 dollars per location, and usage is rebilled per message and per minute, with the 497-dollar plan adding a markup on top. Those costs scale with every client you add. Running on a flat platform with the AI on your own keys and your own Twilio drops your cost of goods close to raw provider cost, so your retainer stays where the value justifies it and the spread survives to become profit.",
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
