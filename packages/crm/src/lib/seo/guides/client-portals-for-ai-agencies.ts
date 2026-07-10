import type { Guide } from "./types";

export const guide: Guide = {
  slug: "client-portals-for-ai-agencies",
  title: "Client Portals for AI Agencies: What Clients Should See (and What They Shouldn't)",
  description:
    "A white-label client portal is what turns an invisible AI agent into a monthly retention story. Here's what belongs in it, what doesn't, and how to white-label it without leaking data across clients.",
  targetKeyword: "white label client portal",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/agencies",
  dek: "An AI agent that works perfectly and invisibly gets cancelled — the owner forgets what they're paying for. A client portal is the fix: the place where the work becomes visible, the retention call has something to point at, and \"what are we paying for?\" stops being a question. Here's what actually belongs on that screen, and what should never be there.",
  sections: [
    {
      h2: "Why the portal is the retention surface",
      body: "An agent that answers calls, captures leads, and books jobs perfectly in the background produces zero felt value if the owner never sees it happen. A month goes by, the invoice hits, and the natural question is \"what am I actually paying for?\" — not because the agent underperformed, but because its output was invisible. Cancellations in service businesses track ambient value, not delivered value, and an agent working silently delivers plenty of the latter and none of the former.\n\nA client portal closes that gap. A screen where the business owner can see calls answered, leads captured, and jobs booked turns invisible work into something they can point to. Done well, the portal is your monthly report, except it's self-serve and it's live all the time instead of a PDF you send once a month. It's the single highest-leverage piece of UI an agency can build, because it's the difference between a client remembering why they signed up and a client wondering if they still need you.\n\nThis isn't a novel idea — it's an established pattern in service-business software generally. Field-service platforms like Jobber ship a customer-facing portal (\"client hub\") specifically so the end customer can \"request work, approve quotes, review scheduled jobs, make payments\" without a phone call, and agency platforms like GoHighLevel sell branded client-facing portals as a paid add-on precisely because agencies want their own logo on the screen their clients use. An AI agency's client portal is the same idea aimed one level up the chain: not the homeowner watching their own job, but the business owner watching their agent work.",
    },
    {
      h2: "What belongs in a client portal (and what doesn't)",
      body: "Four things earn a place on the screen. The activity feed — actual conversations the agent had, with its read-backs visible, so the owner can see the agent got the details right, not just that a conversation happened. The numbers that map to money — leads captured, jobs booked, reviews collected — because those are the metrics an owner already thinks in, not agent uptime or token counts. Their calendar and contacts, since that's the operational data they need day to day regardless of the agent. And simple controls: business hours, service list, the number to escalate to when something needs a human. All four map to a question a client already has in their head.\n\nJust as important is the list of what does not belong there. Model settings, prompt internals, system messages — none of it means anything to a business owner and all of it invites second-guessing you don't want. Your margin — what you pay for the platform versus what you charge — is exactly the number that turns a value conversation into a price negotiation the moment it's visible. And other clients' anything: the fastest way to lose every client in one afternoon is a portal that leaks across accounts. The rule of thumb: if a metric maps to a business outcome, show it; if it maps to how the agent works internally, or belongs to someone else's account, it stays out.",
    },
    {
      h2: "White-labeling it",
      body: "The portal is your agency's front door, not a page with the platform's logo on it. That means a custom domain, your logo, your colors — and the underlying platform staying invisible to the client. A client who discovers which platform is running underneath your brand hasn't learned anything useful; they've just learned they could shop around you.\n\nThe non-negotiable underneath the branding is per-client isolation. Every query that resolves a client's data has to be scoped to that client's account, full stop — a portal that shows even one field from another client's workspace is the kind of leak that ends an agency relationship (and possibly the agency), regardless of how good the agent underneath it is. White-labeling is cosmetic; isolation is structural, and the structural piece is the one you can't cut corners on.",
    },
    {
      h2: "The transparency trade-off, honestly",
      body: "Showing a client the full conversation log is the single fastest way to build trust — they see exactly what their agent said, in their own customers' words, with nothing hidden. It's also the fastest way to expose every mistake the agent makes, because every awkward answer, every missed detail, every hallucinated fact is sitting right there in plain view for the client to find.\n\nThe honest answer isn't to hide the logs — hiding them just delays the moment a client finds out the hard way, and it trades a manageable trust problem for an unmanageable one. The answer is guardrails and a review workflow good enough that what's in the log is something you're willing to stand behind: read-back verification before a claim goes out, escalation for anything outside the agent's confidence, and a process for catching drift before the client does. An agency that shows its logs is implicitly making a never-lies promise to that client. Make sure the agent can actually keep it before you turn the log view on.",
    },
    {
      h2: "Build vs. assemble",
      body: "Two real paths get you a portal. DIY: build a dashboard app that reads from your CRM's and calendar's APIs, wire up your own auth and per-client scoping, style it yourself. It's real engineering work, but it's fully yours — no platform dependency, no per-seat portal fee, and you control every pixel and every access rule. For an agency with the engineering time and a specific portal vision, that's a legitimate, durable choice.\n\nThe other path is a platform-provided white-label portal that ships as part of the stack you're already running the agent on — no separate build, but you're accepting the platform's data model and its ceiling on customization. Disclosure, since we build one of these: every SeldonFrame client workspace ships an agency-brandable portal with CRM, calendar, and agent activity included, on the same $29/mo flat pricing with unlimited workspaces and BYOK — so weigh this paragraph as the sales pitch it partly is. Neither path is wrong; the DIY route is more work and more control, the assembled route is faster and gets you selling sooner.",
    },
    {
      h2: "Operating rhythm",
      body: "The portal doesn't replace the human relationship — it's the artifact you walk through during it. The renewal driver isn't the portal existing; it's the monthly 15-minute call where you pull it up together and walk the client through their own numbers: here's what the agent caught this month, here's what it booked, here's the one thing worth changing. A portal nobody ever opens together with the client is a feature nobody notices. A portal that's the centerpiece of a recurring call is the reason the invoice keeps getting paid.",
    },
  ],
  faq: [
    {
      q: "Do small-business clients actually log in and use the portal?",
      a: "Honestly, some never do — plenty of owners are heads-down running the business and won't open a dashboard on their own initiative. That's fine. The portal still does its job as the artifact you pull up together on the monthly review call; it doesn't need to be something they check daily to win the renewal, it needs to exist and be worth looking at when you show it to them.",
    },
    {
      q: "What access level should client staff get, versus the owner?",
      a: "The owner gets the full view: activity, numbers, calendar, controls. Front-line staff generally only need what's operationally relevant to them — the calendar and maybe the activity feed — not the controls or anything that touches billing or agent configuration. Treat access level as a real permission decision, not an afterthought; a receptionist account that can change business hours or escalation numbers is more exposure than most agencies intend to grant.",
    },
    {
      q: "Can the client edit the agent themselves?",
      a: "Controls, yes — hours, services, the escalation number are all things a client should be able to change without calling you. Internals, no — prompt wording, model settings, guardrail logic stay on the agency side. The line is the same one that governs what's visible: if it's a business fact, the client can own it; if it's how the agent is built, that stays with whoever's accountable for it working correctly.",
    },
    {
      q: "What happens to the portal (and the client's data) if the client leaves?",
      a: "This should be decided and written down before it's needed, not improvised during a cancellation. At minimum: the client's conversation history and contact data should be exportable, access should be revocable immediately, and the portal URL should stop resolving or be handed off cleanly if the relationship transfers. An agency that can't answer this question clearly is carrying real risk in every contract it signs.",
    },
  ],
  sources: [
    {
      label: "GoHighLevel — Pricing (white-label mobile app, branded client portal app, and desktop white-labeling as line items)",
      url: "https://www.gohighlevel.com/pricing",
    },
    {
      label: "Jobber — Client Hub (\"your customer's online portal where they can request work, approve quotes, review scheduled jobs, make payments\")",
      url: "https://www.getjobber.com/features/client-hub/",
    },
  ],
};
