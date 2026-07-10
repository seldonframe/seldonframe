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
  dek: "A wave of solo founders and agency owners is talking about running a real company — sales, content, ops, support — with a stack of AI agents instead of a payroll. Strip away the hype and there's a genuinely useful operating model underneath. Here's what it actually is, and what it takes to run.",
  sections: [
    {
      h2: "What a \"one-person company OS\" actually is",
      body: "The idea behind the term: one human stays in the decision seat, and a set of AI agents handle execution — drafting, researching, following up, filing, summarizing — the work that used to require a small team. Posts describing \"$1B one-person companies\" or a stack of ten agents running a business are describing an aspiration people are actively chasing, not an established result, and it's worth treating it that way: a direction, not a benchmark.\n\nThe part the shorter posts tend to skip is the piece that actually makes this work: the files. An agent has no memory between sessions unless you give it one — a document describing who you are, how you write, what your process is, what happened last time. The company, in this model, is less \"ten clever bots\" and more the accumulated context: the standing instructions and knowledge that turn a stateless model into something that behaves like it knows your business. Anthropic's own description of Claude Projects makes this explicit — a project is \"a persistent workspace where Claude always knows who you are, what you are working on, what documents are relevant\" precisely because you've loaded that context in once, rather than re-explaining it every conversation.",
    },
    {
      h2: "The roles people are actually assembling",
      body: "Most versions of this stack converge on a similar set of roles, each doing one job with a clear handoff back to the human: a leads agent that captures and qualifies new inquiries before a human decides who's worth a call; a research agent that gathers and summarizes information on demand; a docs agent that drafts and files the paperwork a business generates constantly; an ads agent that drafts and reports on campaigns for a human to approve; a content agent that turns work already done into posts, emails, or articles; a sales agent that follows up and moves conversations forward without closing anything itself; a product agent that tracks feedback and roadmap items; an ops agent that runs the recurring internal checklists; a finance agent that drafts invoices and flags anomalies; and a review agent — arguably the most important one — that checks the other agents' output before it reaches a customer.\n\nNotice what's missing from that list: none of them are described as making the final call. Every role above produces a draft, a recommendation, or a flag. The decision — send it, ship it, spend it — stays with the human. That's not a limitation of the model; it's the design.",
    },
    {
      h2: "The part that makes it work or fail: gates, not agents",
      body: "An agent without a trigger, a definition of done, and a review step is just a chat session you have to remember to open. The one-person-company-OS posts sell the roster; the failure mode nobody sells is the same roster running unattended with no gate — an agent drafting an email nobody reads before it sends, or filing a doc nobody checks for accuracy.\n\nThe keystone isn't which ten roles you pick. It's the loop each one runs in: what starts it (a schedule, an event, a human prompt), what \"done\" looks like for that run, and who — or what — checks the output before it becomes a real action. A content agent with no review gate publishes whatever it drafts. The same agent with a gate produces a draft, a second pass checks it against the facts and the voice, and only then does a human hit publish. The gate is the difference between a business and a very confident autocomplete.",
    },
    {
      h2: "The honest build-it-yourself path",
      body: "You can assemble this today with no product in the middle: an MCP server per tool you want an agent to reach (calendar, email, CRM, whatever holds your data), a folder of hand-maintained context files per agent role, a scheduler (cron, or a workflow tool) to trigger each loop, and gates you design and enforce yourself — a second prompt that checks the first, a human approval step, a validation script. The Model Context Protocol exists precisely so this connecting work happens once per tool rather than once per agent, which is the main thing that makes DIY tractable at all.\n\nThe honest trade-off: you keep full control and the software itself costs nothing, but assembling ten roles with real gates is closer to a weekend of configuration than an afternoon — and it doesn't stay done. Tools change their APIs, context files drift out of date as your business changes, and schedules need tending. If you like owning your stack and don't mind the maintenance, this is a completely legitimate way to run it — plenty of people should build it exactly this way.",
    },
    {
      h2: "The 3-minute path",
      body: "The other option is to start from a stack that's already wired together: a workspace where the \"business brain\" — the standing context every agent should share — lives in one place, agents are pre-connected to your CRM, booking calendar, and phone rather than needing an MCP server hand-built per tool, and the review-gate machinery is already part of how an agent gets built and published rather than something you bolt on after. That's what SeldonFrame ships in one conversation, and disclosure is due here: we build that product, so weigh this paragraph as the sales pitch it partly is.\n\nNeither path is the \"correct\" one in the abstract. If assembling and maintaining the DIY version sounds like a project you'd enjoy, it's a real, capable way to get here. If the ten-role stack is a means to an end — more time, not a new hobby — starting from an assembled version and customizing from there gets you running today instead of in three weekends.",
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
