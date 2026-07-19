import type { Guide } from "./types";

export const guide: Guide = {
  slug: "ai-agent-statistics",
  title: "AI Agent Statistics (2026): What the Primary Sources Actually Say",
  description:
    "Most \"AI agent statistics\" pages are aggregators reblogging numbers nobody can trace. This one only includes figures we verified against the primary source, with the source, date, and what was actually measured.",
  targetKeyword: "ai agent statistics",
  intent: "informational",
  cluster: "sell-agents",
  relatedTool: "/tools/agency-margin-calculator",
  relatedBest: "/marketplace",
  dek: "Search \"AI agent statistics\" and you get the same handful of numbers copied from listicle to listicle, most untraceable past the third blog that repeated them. This page does the opposite: every figure below was checked against its primary source, dated, and labeled with exactly what was measured. Where the number didn't hold up, we say so instead of repeating it.",
  sections: [
    {
      h2: "Methodology: why this page is different",
      body: "Every statistic below was checked against its primary source on 2026-07-10 — not a blog post citing a blog post citing a study, but the survey page, the report, or the pricing document itself. Each figure is attributed with who measured it, when, and what was actually asked, because \"70% of businesses use AI\" means something different depending on whether the question was \"have you ever tried a chatbot\" or \"do you have AI in production.\"\n\nWhere a number circulates widely in AI-agent marketing but doesn't trace to a source we could independently verify, it's called out by name in its own section below rather than quietly repeated. And where a category of claim — enterprise analyst predictions from McKinsey or Gartner, for instance — sits behind a paywall or a fetch block we couldn't get past this session, we say that plainly and drop the stat rather than launder it secondhand from a search snippet. A page of eight bulletproof numbers is more useful, and more citable, than fifty that might not survive a click-through.",
    },
    {
      h2: "What's actually verified on enterprise AI adoption",
      body: "Stanford HAI's 2026 AI Index Report (Economy chapter, hai.stanford.edu/ai-index/2026-ai-index-report/economy) is the one enterprise-adoption source that verified cleanly this session.\n\nIt reports that generative AI is now used in at least one business function at **70% of organizations**. Organizational AI adoption more broadly reached **88%** — meaning nearly nine in ten surveyed organizations use AI in some form, not necessarily agents specifically.\n\nThe same report draws a sharp line that most \"AI agent statistics\" pages blur past: *AI agent* deployment specifically was in the single digits across nearly all business functions. Read plainly, that means the widely-used \"generative AI\" adoption numbers (chatbots, copilots, drafting tools) and \"AI agent\" adoption (systems that take multi-step action with a tool) are **not the same statistic** — most of the big round numbers in circulation are measuring the former while agent-specific marketing implies the latter.\n\nWe also attempted to verify McKinsey's \"The State of AI\" survey series and Gartner's newsroom predictions on agentic AI — the two most-cited sources for this topic. McKinsey's report pages timed out or reset the connection across three separate URLs this session.\n\nGartner's newsroom and its individual press-release pages returned HTTP 403 on every attempt, including two alternate paths. Rather than cite either secondhand from a search-result summary, we're dropping both stat classes here. If you've seen a specific McKinsey or Gartner figure quoted elsewhere, treat it as unverified by this page until we can fetch the source directly.",
      diagram: {
        type: "bars",
        title: "Stanford HAI 2026 AI Index — what's actually adopted",
        items: [
          { label: "Generative AI in at least one business function", value: 70, display: "70%", domain: "hai.stanford.edu" },
          { label: "Organizational AI adoption, broadly", value: 88, display: "88%", domain: "hai.stanford.edu" },
        ],
        note: "AI agent deployment specifically was in the single digits across nearly all business functions — these two bars are generative-AI and overall-AI adoption, not agent adoption.",
      },
    },
    {
      h2: "The developer and ecosystem plane: what agents actually cost and connect to",
      body: "The *Model Context Protocol* (MCP) has an official public registry at registry.modelcontextprotocol.io, described on the page itself as being \"built in the open by MCP contributors,\" with its source at github.com/modelcontextprotocol/registry. It exists to let AI applications discover MCP servers rather than requiring a custom integration per tool.\n\nWe could not verify a total server count this session — the registry's live listing loads dynamically and didn't return a number to a static fetch. So we're citing its existence and purpose only, not a size claim.\n\nOn the cost side, Anthropic's own published pricing (platform.claude.com/docs/en/about-claude/pricing, fetched 2026-07-10) lists per-model per-million-token rates — for example **Claude Haiku 4.5 at $1/MTok input and $5/MTok output**. It includes Anthropic's own worked example: processing 10,000 customer-support tickets at roughly 3,700 tokens per conversation on Haiku 4.5 comes out to **approximately $37.00 total**.\n\nThat $37-per-10,000-tickets figure is Anthropic's own illustrative math, not an independent study of real-world support costs, and it excludes tool calls, retries, and orchestration overhead. Still, it's a real, sourced number for what raw model inference costs at agent scale — more than most \"AI agents cost X\" claims in marketing copy can say for themselves.\n\nWe also checked Wikipedia's GPT Store entry, since it sometimes carries sourced scale figures (\"N million GPTs created\") that trace back to OpenAI announcements. As of this fetch, the article didn't cite a specific count of GPTs or custom agents in the store, so there's nothing to report from that source this round.",
      callout: {
        kind: "analogy",
        text: "The MCP registry is a phone book for tools, not a tool itself — it lists which MCP servers exist and where to find them, the same way an app store's catalog page lists apps without being one.",
      },
    },
    {
      h2: "The small-business reality check",
      body: "Consumer trust in reviews is one of the few small-business-adjacent stats with a clean, recent primary source. BrightLocal's Local Consumer Review Survey 2026 (brightlocal.com/research/local-consumer-review-survey, fetched 2026-07-10) reports that **97% of consumers read reviews** for local businesses.\n\nIt also reports that **49% place as much trust** in reviews from strangers online as they do in personal recommendations from people they know. Note that second figure specifically: it's just under half, not the \"as much as word of mouth\" framing that some recap posts round up to.\n\nWhat we could not find, despite looking, is a reliable primary-source statistic for AI-agent adoption specifically among small businesses — how many SMBs have deployed a booking agent, a receptionist agent, or a follow-up agent, as opposed to having tried ChatGPT once. The category is too new and too fragmented across vendors for anyone to have published a credible survey number yet.\n\n\"Reliable SMB agent-adoption statistics don't exist yet\" is itself the honest, useful finding here. It's worth stating plainly instead of filling the gap with an enterprise number that doesn't transfer down-market.",
    },
    {
      h2: "The zombie stats: numbers we could not trace",
      body: "Two figures show up constantly in AI-agent and [speed-to-lead](/guides/what-is-speed-to-lead) marketing, and neither one traces cleanly to a checkable primary source, even after trying.\n\nThe first: \"78% of customers buy from the first company to respond.\" This gets attributed, depending on the post, to McKinsey, InsideSales.com, or Forrester. The real research trail leads to a 2007 Lead Response Management study by Dr. James Oldroyd at MIT Sloan with InsideSales.com, analyzing roughly 1.25 million sales leads.\n\nBut that study's actual published figures are about connect and qualification rates — leads contacted within 5 minutes were dramatically more likely to connect and qualify than those contacted after 30 minutes — not a \"78% buy from the first responder\" figure. The 78% number appears to be a **later paraphrase**, credited in some places to a separate \"Lead Connect\" write-up, that has been repeated so many times it now reads as if it came from the original MIT study. It didn't, as far as we could trace this session.\n\nThe second: \"62% of calls to small businesses go unanswered.\" This traces to a 411 Locals study, cited across dozens of [missed-call](/guides/how-to-build-a-missed-call-text-back-agent) statistics blog posts with a specific breakdown (37.8% answered live, 37.8% to voicemail, 24.3% no response at all).\n\nBut the dates on the study itself contradict across the sources that cite it — some call it a 2023 study, others describe the underlying research as conducted 2013–2015 and published in 2016 — and we could not locate the original 411 Locals report directly to resolve which is correct. We're not asserting the 62% figure is false. We're saying we could not independently verify it against a primary source this session, and a decade-old, date-inconsistent citation trail is exactly the pattern to be skeptical of.\n\nThe general pattern behind both: a real (or real-ish) study gets paraphrased once, the paraphrase gets rounded for a headline, and the rounded number circulates through enough slide decks and blog posts that it eventually gets cited as if it were the original finding. None of that makes the underlying phenomenon untrue — missed calls and slow follow-up plainly cost businesses money. It just means the specific percentage attached to it should be treated as **folklore, not data**, until someone traces it back.",
      callout: {
        kind: "tip",
        text: "A quick way to spot a zombie stat: if three different posts credit the same number to three different sources (McKinsey here, Forrester there, \"a study\" somewhere else), none of them checked — they copied the number, not the citation.",
      },
      diagram: {
        type: "compare",
        title: "What the original research said vs. what got repeated",
        left: {
          heading: "The actual research",
          items: [
            "2007 MIT Sloan / InsideSales.com study: faster contact meant higher connect and qualification rates",
            "411 Locals: 37.8% answered live, 37.8% voicemail, 24.3% no response",
          ],
        },
        right: {
          heading: "The recycled marketing line",
          items: [
            "\"78% buy from the first company to respond\" — an untraceable later paraphrase",
            "\"62% of calls go unanswered\" — same number, date-inconsistent citation trail",
          ],
        },
      },
    },
    {
      h2: "What we'll add when it exists",
      body: "The numbers we most want for this page — real, published data on AI-agent marketplace economics, seller earnings, payout terms, or agent-to-agent transaction volume — are mostly unpublished across the industry, SeldonFrame included. That's not a gap we're pretending doesn't exist. It's a category we'll add to this page the moment a primary source publishes it, with the same verification standard applied above.\n\nOn our own numbers, disclosure: SeldonFrame publishes its pricing and fee structure openly — **$29/mo flat**, plus a **flat 2% GMV fee**, only when SeldonFrame is the sales channel and only on solo tiers (0% on agency plans) (see [how AI marketplace fees compare](/guides/ai-marketplace-fees-compared)) — as our contribution to the transparency this page is asking everyone else to have. That's the one SeldonFrame-specific claim on this page, and it's here so the disclosure is explicit rather than folded into the stats above.",
      callout: {
        kind: "analogy",
        text: "A *GMV fee* works like a consignment shop's cut, not a subscription: SeldonFrame only takes a percentage when it actually brings the sale — a flat 2% on solo tiers, 0% on agency tiers — nothing is charged on revenue SeldonFrame had no part in.",
      },
    },
  ],
  faq: [
    {
      q: "How many businesses actually use AI agents?",
      a: "There isn't a clean answer, because most published surveys measure generative AI adoption broadly (chatbots, copilots, drafting tools), not AI agents specifically. Stanford HAI's 2026 AI Index reports generative AI in use at 70% of organizations and 88% overall AI adoption — but the same report notes AI agent deployment specifically was in the single digits across nearly all business functions. Agent-specific data is younger and much thinner than generative-AI-adoption data.",
    },
    {
      q: "Is AI agent adoption actually growing?",
      a: "The verified trajectory claim we can point to is directional, not a specific growth percentage: Stanford HAI's own year-over-year framing describes generative AI's business-function adoption and the broader 88% organizational AI-adoption figure as recent developments as of the 2026 report. We're deliberately not citing a specific \"AI agent adoption grew X% year over year\" number here, because we couldn't verify one against a primary source this session — see the zombie-stats section above for why that matters.",
    },
    {
      q: "Where do AI agent statistics actually come from?",
      a: "A small number of primary sources: enterprise research shops (Stanford HAI, and in theory McKinsey and Gartner, though both blocked our fetch attempts this session), consumer-trust surveys run by review platforms (BrightLocal), and vendors' own published pricing and technical docs (Anthropic's pricing page, the MCP registry). Almost everything else circulating is a repost of one of those, sometimes several links removed and mutated along the way — which is the whole reason this page exists.",
    },
    {
      q: "How often is this page updated?",
      a: "Every figure above is dated to when it was checked — 2026-07-10 for this version. When we revisit this page, we re-verify each stat against its live primary source rather than assuming it still holds, and we'll add sources we couldn't reach this time (McKinsey, Gartner, an SMB-specific agent-adoption survey, marketplace economics) as soon as they become independently fetchable or get published.",
    },
  ],
  sources: [
    {
      label: "Stanford HAI — 2026 AI Index Report, Economy chapter",
      url: "https://hai.stanford.edu/ai-index/2026-ai-index-report/economy",
    },
    {
      label: "BrightLocal — Local Consumer Review Survey 2026",
      url: "https://www.brightlocal.com/research/local-consumer-review-survey/",
    },
    {
      label: "Anthropic — Claude API Pricing",
      url: "https://platform.claude.com/docs/en/about-claude/pricing",
    },
    {
      label: "Official MCP Registry",
      url: "https://registry.modelcontextprotocol.io",
    },
  ],
};
