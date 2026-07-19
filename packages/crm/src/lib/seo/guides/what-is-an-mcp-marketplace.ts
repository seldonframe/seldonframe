import type { Guide } from "./types";

export const guide: Guide = {
  slug: "what-is-an-mcp-marketplace",
  title: "What Is an MCP Marketplace? Agents-as-MCP-Servers, Explained",
  description:
    "An MCP marketplace is where MCP servers — and increasingly whole agents — get discovered, connected, and sometimes rented. Here's the clearest current definition, the three layers people mean by the term, and what's still unsettled.",
  targetKeyword: "mcp marketplace",
  intent: "informational",
  cluster: "sell-agents",
  relatedTool: "/tools/claude-project-brief-generator",
  relatedBest: "/marketplace",
  dek: "\"MCP marketplace\" gets used for at least three different things right now, and the term is young enough that no single source has nailed down the definition. Here's the most precise one available, the layers underneath it, and the honest list of what's still unsettled.",
  sections: [
    {
      h2: "What MCP is, in one paragraph",
      body: "The Model Context Protocol (*MCP*) is an open-source standard for connecting AI applications to external systems. Those systems are the data sources, tools, and workflows an AI assistant needs to actually do something useful.\n\nEach one gets **described once, not rebuilt per assistant**. Anthropic's own framing is the cleanest available: think of MCP like a USB-C port for AI applications — one standard plug, instead of a custom cable for every device.\n\nAn MCP marketplace, then, is a directory or store where MCP servers — the things being plugged in — get discovered, connected, and, in the commercial layer, **rented or sold**.",
      callout: {
        kind: "analogy",
        text: "MCP is the USB-C port on your laptop. Before USB-C, every device needed its own cable. After, one port fits everything. MCP does that for AI apps and the tools they need to reach — one standard connector instead of a custom integration per tool.",
      },
    },
    {
      h2: "The three layers people mean by \"MCP marketplace\"",
      body: "Right now the phrase covers at least three different things. Mixing them up is the fastest way to misread a claim about this space.\n\nThe first layer is **open registries** — plain discovery indexes of MCP servers, with no commerce attached. The Official MCP Registry (registry.modelcontextprotocol.io) is the clearest example. It describes itself as built \"in the open by MCP contributors\" and exists to let you discover MCP servers, full stop — no rental, no billing, no reputation system beyond what's listed.\n\nThe second layer is **curated connector directories** built into AI products themselves — the \"here are the tools this assistant can already reach\" list inside a given app. These are discovery plus one-click connection, scoped to whichever product hosts them.\n\nThe third layer is the **commercial** one, and it's the newest. Here an MCP endpoint isn't just listed — it's a product you rent, metered by usage, gated behind a key, and revocable if something goes wrong. That's where the interesting new behavior lives: it turns \"connect to a tool\" into \"buy access to a capability.\"",
      diagram: {
        type: "stack",
        title: "The three layers of \"MCP marketplace\"",
        layers: [
          { label: "Commercial marketplace", sub: "rent an endpoint — metered, keyed, revocable" },
          { label: "Curated connector directory", sub: "one-click connect, scoped to one AI product" },
          { label: "Open registry", sub: "free discovery index, no commerce" },
        ],
      },
    },
    {
      h2: "The conceptual jump: agents as MCP servers",
      body: "Nothing in the MCP spec requires a server to wrap a narrow tool like a database query or a calendar lookup. A server can just as easily wrap **an entire working agent** — a receptionist that qualifies leads, a research assistant that drafts summaries, a support agent that handles a defined slice of tickets.\n\nOnce that's true, \"renting an agent\" stops being a metaphor. It means receiving an MCP endpoint plus a signed key — the same shape as renting access to any other tool.\n\nThat reframing matters for two reasons. It makes **agent composition** possible the same way tool composition already works under MCP — one agent can call another agent's MCP endpoint as a tool call, same as it would call a calendar API. And it changes what a buyer is actually purchasing: not a piece of software to run and maintain, but a **working capability**, billed for what it does rather than sold as a license.",
    },
    {
      h2: "What a real marketplace layer adds beyond a directory",
      body: "A plain registry answers one question: does this server exist and where is it. A marketplace has to answer several more before money changes hands.\n\nCan this be trusted? How is usage metered and billed? How does a key get issued and revoked if something breaks? How are versions tracked, so a buyer isn't silently running a different agent than the one they evaluated?\n\n**Trust is the hardest of these.** A buyer typically can't read the code behind an MCP endpoint before renting it — they're evaluating a black box. That's why reliability signals become the currency a marketplace layer has to supply: published *evals*, guardrails that are actually enforced rather than just claimed, a track record of behaving predictably.\n\nWithout those signals, a commercial MCP marketplace is just a registry with a checkout button bolted on. The signals are what make the checkout button trustworthy.",
      callout: {
        kind: "tip",
        text: "Before renting an agent through any commercial marketplace, ask what backs the trust claim specifically — a published eval score, a guardrail you can inspect, a usage history — not just a star rating or a marketing page.",
      },
    },
    {
      h2: "What's still unsettled",
      body: "This space is young enough that several load-bearing pieces don't have settled answers yet. Worth naming them as open questions, not papering over them with a confident prediction.\n\n**Payment standards for agent-to-agent commerce are still forming.** Approaches built around the HTTP 402 status code (sometimes called x402-style payment rails) exist and are being discussed in the ecosystem — but they're early, and no dominant standard has emerged.\n\n**Quality and security review norms are likewise unsettled.** There's no widely agreed process yet for vetting what gets listed in a commercial marketplace before a buyer connects to it.\n\nAnd **discovery itself is still fragmented** across the three layers above, with no single place a buyer can check that covers all of them. Treat anything more specific than that as a bet, not a fact.",
      callout: {
        kind: "warning",
        text: "If a marketplace claims a settled payment standard, a universal vetting process, or one place that indexes everything, that claim is ahead of where the ecosystem actually is right now.",
      },
    },
    {
      h2: "How SeldonFrame implements this",
      body: "Disclosed plainly: we build this product, so read this paragraph as the vendor case it partly is.\n\nSeldonFrame lets builders [publish agents to a marketplace](/guides/how-to-make-money-selling-ai-agents) and rent them out via MCP with signed rental keys. A buyer connects to a working agent — not a codebase they have to host — and can be cut off cleanly if a key needs revoking. Agents can also be deployed [white-label](/guides/white-label-ai-agents) under an agency's own brand.\n\nThe whole platform runs on a flat $29/mo, *BYOK* (bring your own model-provider keys), with the first workspace free. No separate marketplace toll on top of that base price.",
    },
  ],
  faq: [
    {
      q: "Is there an official MCP marketplace or registry?",
      a: "There's an **Official MCP Registry** at registry.modelcontextprotocol.io, which describes itself as built \"in the open by MCP contributors\" for discovering MCP servers. It's a discovery index, not a commercial marketplace — no rental, billing, or key issuance layer is part of it.",
    },
    {
      q: "Can I sell an MCP server?",
      a: "You can list one in a discovery registry for free. Or offer it through a commercial marketplace layer that adds metering, keys, and billing on top. Which path makes sense depends on whether you want simple visibility or an actual **revenue channel** — the two aren't the same product.",
    },
    {
      q: "What's the difference between an MCP server and an AI agent?",
      a: "An MCP server is a connection point — it exposes tools, data, or workflows in a standardized way so an AI application can reach them. An AI agent is a system that uses tools (via MCP or otherwise) to pursue a goal.\n\nThe two **converge** when a whole agent is wrapped as an MCP server. At that point, renting the agent means receiving an MCP endpoint the same way you'd receive access to any other tool.",
    },
    {
      q: "Do MCP marketplaces handle payments?",
      a: "Some do, some don't — it depends on which layer you're looking at. Plain registries don't touch payments at all. Commercial marketplaces that rent out MCP endpoints (including agents) typically handle metering and billing themselves. **Standardized agent-to-agent payment rails** for this are still early and not yet settled across the ecosystem.",
    },
  ],
  sources: [
    {
      label: "Model Context Protocol — \"What is the Model Context Protocol (MCP)?\"",
      url: "https://modelcontextprotocol.io/introduction",
    },
    {
      label: "Official MCP Registry",
      url: "https://registry.modelcontextprotocol.io",
    },
  ],
};
