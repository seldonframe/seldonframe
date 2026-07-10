import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-rent-out-an-ai-agent-via-mcp",
  title: "How to Rent Out an AI Agent via MCP (Signed Keys, Metering, and Getting Paid)",
  description:
    "You built a working agent. Here's the practitioner path to renting it out over MCP instead of selling code or hosting a UI — what has to be true technically, what a marketplace adds, and how to actually get paid.",
  targetKeyword: "monetize mcp server",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/claude-project-brief-generator",
  relatedBest: "/marketplace",
  dek: "If you've already got an agent that works — it qualifies leads, drafts research, checks compliance, whatever — the question isn't \"what is MCP,\" it's \"how do I turn this into recurring revenue without becoming a support desk.\" Renting it out over MCP is one real answer. Here's what that actually takes, DIY and otherwise.",
  sections: [
    {
      h2: "The model, in one paragraph",
      body: "Instead of shipping your agent as code someone else has to run, or hosting a UI someone else has to log into, you expose it as a remote MCP server: a live endpoint. A customer connects their own AI client to that endpoint using a key you issued them, and from that point on your agent is just another tool their client can call — the same way it would call a calendar or a database. You meter what they use and bill for it. \"Renting,\" here, means access, not ownership: you keep the agent, its accumulated knowledge, and every improvement you make to it going forward. The customer never gets a copy to walk away with.",
    },
    {
      h2: "What has to be true technically",
      body: "First, your agent has to be reachable as a remote MCP server, not just a local one. The MCP spec defines two standard transports: stdio, where a client launches your server as a local subprocess, and Streamable HTTP, where your server runs as an independent process handling multiple client connections over a single HTTP endpoint. Renting to someone else's client requires the HTTP transport — stdio is for a client launching a process it controls directly, which isn't the shape of a rental at all.\n\nSecond, you need per-customer credentials you can revoke. The spec's authorization framework covers exactly this for HTTP-based MCP servers: it's built on OAuth 2.1, with your server acting as an OAuth resource server that validates bearer tokens on every request. Authorization is optional in the spec — a server can choose not to implement it — but for a rental business it's not optional in practice, because without per-key credentials you have no way to meter one customer separately from another, or cut one off without cutting off everyone.\n\nThird, you need usage logging per key, because metering and billing depend on knowing which key made which call. And fourth, you need rate limits, because a rented endpoint is calling your model provider on every request — without a ceiling, one customer's usage spike becomes your token bill. This is exactly where the two payment models diverge: renter-pays-BYOK, where the customer supplies their own model-provider key and you charge only for access to the agent's logic and knowledge, versus owner-pays-metered, where you're fronting the model cost and billing a margin on top. The second model makes rate limits a financial necessity, not just good hygiene.",
    },
    {
      h2: "The commercial layer the protocol doesn't give you",
      body: "MCP defines how a client and server talk to each other and authenticate. It says nothing about what you charge, how you invoice, or what happens when someone stops paying — that's a separate layer you have to build or buy. Pricing is the first decision: flat monthly per key is simpler to sell and simpler to reason about; metered per call maps cost to usage more precisely but means building usage tracking before you can bill anything. Key lifecycle is the second: issuing a key at signup, rotating it on request, and revoking it cleanly on nonpayment or abuse — without a revocation path, a rental business has no way to actually stop serving a customer who stops paying. Terms are the third: what the agent may and may not be used for, since you're the one liable if it gets pointed at something it shouldn't be. And support is the fourth, because a black-box endpoint that breaks with no explanation is a much worse experience than software a customer can at least read the error logs of themselves.",
    },
    {
      h2: "Two honest paths: DIY or a marketplace",
      body: "The DIY path is real, fully-yours plumbing: stand up your agent behind a Streamable HTTP endpoint, wire OAuth or a simpler API-key scheme for per-customer auth, build the usage-logging table, connect Stripe for billing, and write your own terms of use. Nothing here is exotic — it's the same shape of work as standing up any metered API — but it is real, ongoing work: keys need a rotation and revocation flow, usage data needs to reconcile against invoices, and none of it stays done once you ship it once.\n\nThe marketplace path trades that plumbing for listing overhead: you publish once, and the marketplace handles discovery, key issuance, metering, and payouts. Disclosed plainly, since we build this product: SeldonFrame is one such marketplace. Publish an agent and it becomes rentable via MCP with signed rental keys the platform issues and can revoke — you don't build the auth layer yourself. The base platform is $29/mo flat, BYOK (bring your own model-provider keys, so there's no markup on tokens baked into the base price), with the first workspace free. Neither path is objectively correct: if you want full control over pricing, terms, and the customer relationship, DIY is legitimate and not that much harder than building any other metered API. If getting listed and getting paid matters more than owning every layer, starting from a marketplace gets you there faster.",
    },
    {
      h2: "What rents well, and what doesn't",
      body: "Agents that rent well are the ones with accumulated, maintained knowledge behind them — a vertical qualifier that's learned a specific industry's disqualifying questions, a compliance checker tuned to a specific regulatory area, a research agent with a curated set of sources for a niche. The moat in those cases isn't the prompt; it's the ongoing upkeep that keeps the knowledge current, which is exactly the part a renting customer can't replicate by reading your system prompt once. Agents that don't rent well are thin wrappers — a single well-phrased prompt around a general-purpose model with no accumulated context behind it. A customer who can rebuild the same result in an afternoon of their own prompting has no reason to keep paying you monthly for it.",
    },
    {
      h2: "Trust is the sales blocker, and the unlock",
      body: "A renter can't read the code behind your MCP endpoint before connecting to it — they're buying access to a black box, sight unseen, which is a harder sell than software they can inspect first. What converts that hesitation into a sale are legible reliability signals: a published eval pass rate, guardrails you can describe concretely rather than just assert, and usage logs or a track record you're willing to show. It's worth being honest that this norm is still forming across the MCP ecosystem — there isn't yet a widely agreed way to vet or display trust signals for a rented agent endpoint, so whatever you show a prospective renter today is you setting the bar yourself, not meeting an established one.",
    },
  ],
  faq: [
    {
      q: "Who pays for the model tokens — me or the renter?",
      a: "Either, and it's a decision you make explicitly, not something MCP settles for you. Renter-pays-BYOK means the customer supplies their own model-provider key and your charge covers access to the agent's logic and knowledge only. Owner-pays-metered means you front the token cost and bill a margin on top — which makes rate limits per key a financial necessity, not just abuse prevention.",
    },
    {
      q: "What stops a customer from just copying my agent?",
      a: "Nothing stops them from copying a prompt, if that's all there is. The honest answer is that a well-run agent's moat is the accumulated, maintained knowledge behind it — the sources kept current, the edge cases handled over time — not secrecy around the prompt itself. If a customer can rebuild your result in an afternoon, it wasn't a defensible rental in the first place; if they can't, it's because the upkeep is the hard part, and upkeep doesn't copy.",
    },
    {
      q: "Can I revoke a customer's access if they stop paying?",
      a: "You should be able to, and it's worth confirming before you rent to anyone. MCP's authorization framework is built on OAuth 2.1 bearer tokens validated per request, which is the mechanism that makes revocation possible — invalidate the token and the next request fails. Whether that revocation is easy or painful depends entirely on how you built the key-issuance layer, DIY or marketplace.",
    },
    {
      q: "What should I charge?",
      a: "There's no established market rate to cite here, and treat any number you see quoted elsewhere with the same skepticism. The two common shapes are flat monthly per key (simpler to sell, simpler to reason about) and metered per call (maps cost to usage more precisely but requires usage tracking before you can bill anything). Pick the shape that matches how unevenly your customers will actually use the agent, then price to cover your token costs plus the upkeep time the previous section describes — that upkeep is the thing you're actually charging for.",
    },
  ],
  sources: [
    {
      label: "Model Context Protocol — Transports specification",
      url: "https://modelcontextprotocol.io/docs/concepts/transports",
    },
    {
      label: "Model Context Protocol — Authorization specification (2025-06-18)",
      url: "https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization",
    },
  ],
};
