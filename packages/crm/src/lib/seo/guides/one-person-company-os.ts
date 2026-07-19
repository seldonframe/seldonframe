import type { Guide } from "./types";

export const guide: Guide = {
  slug: "one-person-company-os",
  title: "The One-Person Company OS: How to Run a Real Business With AI Agents (Without Hiring)",
  description:
    "\"One-person company OS\" is the model solo founders are assembling right now: one human in the decision seat, AI agents on execution, and the files that make them useful. Here's how it actually works, role by role.",
  targetKeyword: "one person company os",
  intent: "informational",
  cluster: "ai-agents",
  relatedTool: "/tools/claude-project-brief-generator",
  relatedBest: "/marketplace",
  relatedChart: { href: "/charts/ai-recommendation-index", label: "See which platforms AI actually recommends in the AI Recommendation Index" },
  dek: "A wave of solo founders and agency owners is talking about running a real company — sales, content, ops, support — with a stack of AI agents instead of a payroll. Strip away the hype and there's a genuinely useful operating model underneath. Here's what it actually is, and what it takes to run.",
  sections: [
    {
      h2: "What a \"one-person company OS\" actually is",
      body: "The idea is simple. **One human makes the decisions.** A set of AI agents do the execution work — drafting, researching, following up, filing, summarizing — the work that used to require a small team.\n\nYou'll see posts about \"$1B one-person companies\" or ten agents running a whole business. Those describe a **real goal people are actively chasing** — not an established result. Treat it as a direction, not a finish line already reached.\n\nHere's the part shorter posts tend to skip: the files. An agent has *no memory* between sessions unless you give it one.\n\nThat memory is a document. It says who you are, how you write, what your process is, and what happened last time.\n\nSo the \"company\" here isn't really ten clever bots. It's **the accumulated context** — the standing instructions and knowledge that make a stateless model behave like it already knows your business.\n\nAnthropic describes this directly for Claude Projects: a project is \"a persistent workspace where Claude always knows who you are, what you are working on, what documents are relevant.\" You load that context in once. You don't re-explain it every conversation.",
      callout: {
        kind: "analogy",
        text: "Think of the context files like *onboarding notes* for a new hire who has amnesia every morning. Without them, a brilliant new employee still has to ask what the business does on day one — every single day.",
      },
      diagram: {
        type: "stack",
        title: "What sits under each agent",
        layers: [
          { label: "The agent", sub: "drafts, researches, follows up, files" },
          { label: "Standing instructions", sub: "role, tone, facts to assume, what never to do" },
          { label: "Knowledge documents", sub: "pricing, past work, process steps" },
          { label: "Memory of last time", sub: "what happened in the previous run" },
        ],
      },
    },
    {
      h2: "The roles people are actually assembling",
      body: "Most versions of this stack use the same handful of roles. Each one does a single job. Each one hands the result back to a human.\n\nA **leads agent** captures and qualifies new inquiries, so a human can decide who's worth a call. A research agent gathers and summarizes information on demand. A docs agent drafts and files the paperwork every business generates.\n\nAn ads agent drafts and reports on campaigns for a human to approve. A content agent turns finished work into posts, emails, or articles. A sales agent follows up and moves conversations forward — it never closes the deal itself.\n\nA product agent tracks feedback and roadmap items. An ops agent runs the recurring internal checklists. A finance agent drafts invoices and flags anomalies.\n\nThen there's the **review agent** — arguably the most important one. It checks every other agent's output before it reaches a customer.\n\nNotice what's missing: none of these roles make the final call. Every one produces a draft, a recommendation, or a flag.\n\n**The decision — send it, ship it, spend it — always stays with the human.** That's not a limitation of the model. It's the design.",
    },
    {
      h2: "The part that makes it work or fail: gates, not agents",
      body: "An agent needs three things to be useful: a trigger, a clear definition of done, and a review step. Without those, it's just a chat window you have to remember to open.\n\nThe one-person-company-OS posts love to sell the roster of ten agents. They don't sell the failure mode: that same roster running unattended, with no **gate** — an agent drafting an email nobody reads before it sends, or filing a document nobody checks.\n\nThe keystone isn't which ten roles you pick. It's the loop each one runs in: what starts it, what \"done\" looks like, and who checks the output before it becomes a real action.\n\nA content agent with no review gate just publishes whatever it drafts. The same agent with a **gate** produces a draft, a second pass checks it against the facts and the voice, and only then does a human hit publish.\n\n**The gate is the difference between a real business and a very confident autocomplete.**",
      callout: {
        kind: "analogy",
        text: "A *gate* is kind of like the barista repeating your order back before making it — a cheap, five-second check that catches a mistake before it costs you a wasted drink, or a wrong email to a customer.",
      },
      diagram: {
        type: "loop",
        title: "The loop that makes an agent safe to run",
        steps: ["Trigger fires", "Agent does the work", "Gate checks the output", "Human decides"],
      },
    },
    {
      h2: "The honest build-it-yourself path",
      body: "You can build this yourself, with no product in the middle. You'll need an *MCP server* for each tool an agent should reach — calendar, email, CRM, whatever holds your data.\n\nYou'll also need a folder of hand-maintained context files per agent role, a scheduler (cron, or a workflow tool) to trigger each loop, and gates you design and enforce yourself — a second prompt that checks the first, a human approval step, a validation script.\n\nThe *Model Context Protocol* exists so this connecting work happens once per tool, not once per agent. That's the main thing that makes DIY realistic at all.\n\n**The honest trade-off**: you keep full control, and the software itself costs nothing. But assembling ten roles with real gates is closer to a weekend of configuration than an afternoon.\n\nAnd it doesn't stay done. Tools change their APIs, context files drift out of date as your business changes, and schedules need tending.\n\nIf you like owning your stack and don't mind the upkeep, this is a **completely legitimate way to run it**. Plenty of people should build it exactly this way.",
    },
    {
      h2: "The 3-minute path",
      body: "The other option: start from a stack that's already wired together. A workspace holds the **\"business brain\"** — the standing context every agent shares — in one place.\n\nAgents come pre-connected to your CRM, booking calendar, and phone. You don't hand-build an MCP server per tool.\n\nThe review-gate machinery is already part of how an agent gets built and published — not something you bolt on later. That's what SeldonFrame ships in one conversation.\n\nDisclosure: we build that product, so weigh this paragraph as the sales pitch it partly is.\n\nNeither path is \"correct\" in the abstract. If assembling and maintaining the DIY version sounds like a fun project, it's a real, capable way to get there.\n\nBut if the ten-role stack is a means to an end — more time, not a new hobby — **starting from an assembled version gets you running today instead of in three weekends.**",
    },
  ],
  faq: [
    {
      q: "Do I need to know how to code to build this myself?",
      a: "Not strictly — connecting an AI assistant to your tools increasingly happens through the Model Context Protocol (MCP), an open standard Anthropic describes as letting AI applications \"connect to data sources... tools... and workflows\" without custom integration work for each one. But assembling and maintaining a working stack — the context files, the schedules, the review gates — is still real, ongoing configuration work, coding or not.",
    },
    {
      q: "What actually goes in the files that make an agent useful?",
      a: "Two kinds of documents, and it matters which is which. Standing instructions describe behavior: the agent's role, its tone, the facts to assume, and a clear list of what it should never do. Knowledge documents are reference material — pricing, past work, process steps — kept short and specific, since a tightly focused document surfaces better than one bloated with loosely related material.",
    },
    {
      q: "Which agent should I build first?",
      a: "Whichever loop touches revenue most directly — usually the leads agent (nothing else matters if inquiries go unanswered) or the content agent (if distribution is the current bottleneck). Build one loop, put a real gate on it, and confirm it actually saves time before adding a second.",
    },
    {
      q: "Can these agents really run unattended?",
      a: "Only behind a gate, and only for reversible actions. A research agent that drafts a summary can run unattended — worst case, a human ignores a bad draft. An agent that emails a customer, spends money, or publishes content needs a human, or at minimum a strict validation check, at that specific step. Treat \"unattended\" as a property of the gate design, not the agent's confidence.",
    },
  ],
  sources: [
    {
      label: "Model Context Protocol — \"What is the Model Context Protocol (MCP)?\"",
      url: "https://modelcontextprotocol.io/introduction",
    },
    {
      label: "Claude Help Center — \"What are Projects?\"",
      url: "https://support.claude.com/en/articles/9517075-what-are-projects",
    },
  ],
};
