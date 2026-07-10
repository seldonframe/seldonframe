import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-make-an-ai-agent-reliable",
  title: "How to Make an AI Agent Reliable: Grounding, Guardrails, Read-Back, and Evals",
  description:
    "Reliability isn't zero hallucination — it's bounded failure. Four layers that make an AI agent safe to sell: grounding, guardrails, read-back, and evals.",
  targetKeyword: "ai agent reliability",
  intent: "informational",
  cluster: "sell-agents",
  relatedTool: "/tools/ai-receptionist-script-generator",
  relatedBest: "/marketplace",
  dek: "If you sell AI agents, reliability is the product. One hallucinated promise to a client's customer — a price that was never real, an appointment that was never booked — ends the retainer faster than any feature gap. Here's the engineering practice that actually keeps an agent honest, layer by layer.",
  sections: [
    {
      h2: "The reliability frame",
      body: "Start from the right definition or the rest of this is wasted effort: an agent is reliable when its failure modes are bounded, not when it never errs. You cannot prompt your way to zero hallucination — no instruction, however carefully worded, guarantees a language model never says something false. What you can do is design the system around the model so that when it does err, the error gets caught before it becomes an action a customer sees or a promise nobody can keep.\n\nThat design has four layers, and they're deliberately in this order because each one catches what the last one missed. Grounding narrows what the agent is even allowed to draw from. Guardrails fence off the actions and claims it can never make regardless of how the conversation goes. Read-back catches the errors that get past both of those, right before anything irreversible happens. Evals catch regressions before an update ever reaches a live client. None of the four is optional, and none of them alone is sufficient — a grounded agent with no read-back step still books the wrong time slot with total confidence.",
    },
    {
      h2: "Grounding: answer from the business, not from the model",
      body: "A reliable agent answers from the business's actual documents — its services list, its pricing policy, its hours, its service area — not from whatever the underlying model happens to associate with \"plumbing company\" or \"dental practice\" from its general training. Anthropic's own guidance on reducing hallucinations names this directly: explicitly instruct the model to use only the information from the provided documents and not its general knowledge, and where documents are long, have it extract exact quotes before answering so the response stays grounded in the actual text rather than a paraphrase drifting away from it.\n\nThe corollary matters just as much: \"I don't know, let me take your number\" has to be a designed, first-class answer, not a failure state the agent stumbles into. Anthropic's guidance calls this out as one of the simplest and most effective techniques available — explicitly giving the model permission to admit uncertainty measurably cuts false answers. An agent that's never allowed to say \"I'm not sure\" will eventually guess, and a guess dressed up in a confident tone is indistinguishable from a lie to the person hearing it.\n\nThe part that's easy to skip: knowledge freshness is an ongoing duty, not a one-time setup step. A price sheet that's three months stale, a service that's been discontinued, a policy that changed last week — none of that shows up as an error. It shows up as a confident, well-formatted, wrong answer, which is worse than no answer because nothing about it signals \"check this.\" Whoever owns the agent has to own keeping its source documents current, or the grounding layer quietly stops doing its job.",
    },
    {
      h2: "Guardrails: hard fences the model can't argue its way past",
      body: "Guardrails are the rules that hold regardless of how the conversation goes — no matter what the customer says, how they phrase it, or how many turns the agent has been talking. Never quote a firm price unless it's actually present in the grounded data. Never promise a specific arrival time. Never give regulated advice — medical, legal, financial — that requires a license the business doesn't have. Always offer a path to a human when the agent is out of its depth.\n\nThe distinction that actually matters here: a polite instruction inside the system prompt (\"please don't quote prices\") is a suggestion the model can be talked out of across a long enough conversation. A deterministic check outside the model — an output validator that strips or blocks any dollar figure not traceable to the grounded price list, an allowed-action list the agent's tool calls are checked against before they execute — cannot be talked out of anything, because it isn't reasoning about the conversation at all. OWASP's LLM Top 10 names the failure mode this guards against directly: \"Excessive Agency,\" unchecked autonomy granted to an LLM-based system that leads to unintended consequences, and \"Overreliance,\" over-trusting model output without independent verification, which the project describes as leading to compromised decision-making. The fix for both is the same: put the check outside the model, where the model's own persuasiveness can't erode it.",
    },
    {
      h2: "Read-back: confirm before anything irreversible",
      body: "Before any action that can't be quietly undone — a booking, a message sent to a customer, a charge — the agent restates the critical details and gets explicit confirmation. \"So that's Tuesday at 2pm for a water heater install at the address ending in Oak Street?\" is the pattern. The confirmation can come from the customer directly, or from a human operator reviewing a queue before a batch of actions goes out. It's a humble mechanism — it doesn't require the agent to be smarter, just to pause and check — and it's the single pattern that catches the most real-world errors in practice, because most booking and messaging mistakes are transcription or slot-mapping errors, not reasoning failures, and a plain restatement surfaces those instantly.\n\nThe standard for success has to be the observable end state, never the model's own report of what happened. \"The agent said the booking is confirmed\" is not success. The calendar event existing, at the right time, on the right calendar, is success. This is the same discipline as verifying any automated write: check the state the customer or the business will actually see, not the transcript of what the agent claims it did.",
    },
    {
      h2: "Evals: regression-gate every change before it reaches a client",
      body: "Reliability that isn't tested drifts the first time anyone edits a prompt, adds a new service to the knowledge base, or swaps a model version. Evals are scripted scenario suites — the twenty hard calls a real customer might actually make, the edge cases where the caller mumbles the address or asks for something outside the service area — run automatically on every change before it reaches a live client, not spot-checked by a human skimming a few transcripts after the fact.\n\nTwo separate things need to happen here, and it's worth keeping them distinct. Regression gating catches known failure modes before an update ships — did this change break the price-quoting guardrail that worked yesterday? Live monitoring catches new ones — is drift showing up in real conversations that the eval suite never anticipated? A suite that only does the first will still let novel failures reach customers; monitoring without a gating suite means every fix is a live experiment on real callers.\n\nIf you sell agents to clients, there's a business reason to take this further than internal QA: publishing pass rates turns reliability from something you assert into something a buyer can actually check. A claim (\"our agent is reliable\") is worth nothing to someone who can't verify it. A published number, tied to a specific eval suite, run on a specific date, is a signal — the same way a service business publishes its on-time rate instead of just saying \"we're punctual.\"",
    },
    {
      h2: "Reliability as a commercial asset",
      body: "For anyone selling agents into other businesses, all four layers roll up into one commercial fact: your buyer can't read your code. They can't audit your prompt, and they generally shouldn't have to. What they can see — what actually has to carry the trust — are the artifacts these layers produce: eval pass rates, read-back confirmation logs, a documented answer for \"what does this agent refuse to do.\" Legible trust is the whole mechanism by which a marketplace of AI agents can work at all; without it, every buyer is taking the seller's word for it, which doesn't scale past the first sale.\n\nDisclosure, since we're the ones writing this: we build SeldonFrame, and grounded knowledge, guardrail checks, read-back confirmation, and eval suites are built into how an agent gets deployed on the platform by default, not bolted on afterward by whoever remembers to. That's a stated design choice, not a guarantee that every agent built on it is flawless — the four layers above reduce the odds and bound the blast radius of a failure; they don't promise zero failures, on this platform or any other. Weigh this paragraph as the interested party's paragraph that it is.",
    },
  ],
  faq: [
    {
      q: "Can AI hallucinations be eliminated completely?",
      a: "No, and any claim to the contrary should be treated skeptically. Anthropic's own guidance on the subject is explicit that these techniques \"significantly reduce hallucinations\" but \"don't eliminate them entirely,\" and that critical information should always be validated, especially for high-stakes decisions. The honest target isn't zero — it's bounded: catching errors before they reach a customer or become an irreversible action, via grounding, guardrails, and read-back working together.",
    },
    {
      q: "What should an agent always refuse to do?",
      a: "At minimum: quote a firm price that isn't in its grounded data, promise a specific arrival or completion time, give regulated advice (medical, legal, financial) without a licensed human in the loop, and take any irreversible action without a read-back confirmation. The specific list depends on the business, but the pattern is the same — anything that can't be walked back if the agent is wrong needs a hard fence, not a polite instruction.",
    },
    {
      q: "How many eval scenarios are enough?",
      a: "There's no fixed number that's honest across every business — a receptionist agent for a single-service plumber needs a smaller suite than a multi-location agency handling five service lines. What matters is coverage of shape, not a target count: the common happy path, the two or three most frequent edge cases (mumbled address, out-of-area request, unclear intent), and the scenarios where the guardrails specifically get tested (does it try to quote a price it shouldn't?). Grow the suite as real conversations surface new failure modes — it's a living document, not a one-time checklist.",
    },
    {
      q: "Does adding all this slow the agent down?",
      a: "Some of it, yes, and pretending otherwise isn't honest. A read-back confirmation adds a conversational turn. Quote-extraction grounding on long documents adds a processing step before the model answers. That's a real trade-off against a bot that answers instantly and never checks itself — and it's the right trade almost every time, because the cost of a fast wrong answer (a lost customer, a broken promise) is nearly always higher than the cost of one extra confirmation turn. Where it isn't — a low-stakes FAQ answer with no action attached — the read-back step can reasonably be skipped; the design question is which actions are reversible, not whether to add friction everywhere.",
    },
  ],
  sources: [
    {
      label: "Anthropic — \"Reduce hallucinations\"",
      url: "https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations",
    },
    {
      label: "OWASP GenAI Security Project — \"Top 10 for Large Language Model Applications\"",
      url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
    },
    {
      label: "Model Context Protocol — \"What is the Model Context Protocol (MCP)?\"",
      url: "https://modelcontextprotocol.io/introduction",
    },
  ],
};
