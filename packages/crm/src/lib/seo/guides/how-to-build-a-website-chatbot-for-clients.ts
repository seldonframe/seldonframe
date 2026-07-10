import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-build-a-website-chatbot-for-clients",
  title: "How to Build Website Chatbots for Clients (and Sell Them Without the 2018 Baggage)",
  description:
    "Website chatbots earned a bad reputation from rule-tree widgets that couldn't answer a real question. Here's how to spec, build, and sell a grounded version clients actually keep.",
  targetKeyword: "sell chatbots to businesses",
  intent: "commercial",
  cluster: "sell-agents",
  relatedTool: "/tools/website-grader",
  relatedBest: "/marketplace",
  dek: "\"We already tried a chatbot\" is the objection you'll hear most, and it's earned — most small-business owners have a memory of a widget that couldn't answer a real question and annoyed a customer instead. The fix isn't a better pitch. It's building a genuinely different product and being upfront about why the old one failed.",
  sections: [
    {
      h2: "The honest state of website chatbots",
      body: "The reputation is deserved. The 2018-era chatbot was a decision tree wearing a chat bubble: a handful of hardcoded buttons, a keyword-match fallback, and a dead end the moment a visitor typed something the tree didn't anticipate.\n\nBusinesses installed them, watched them frustrate customers, and ripped them out. If you're selling \"a chatbot\" without acknowledging that history, the prospect is silently comparing your pitch to that memory — and you're losing before you've started.\n\nWhat's actually different now is *grounding*. A chatbot built on a current LLM and given the client's real content — services, prices or price ranges, hours, policies, service area — can **answer the specific questions that business actually gets asked**, in the visitor's own words, without a decision tree.\n\nAnd critically, it can also say \"I don't know\" and capture a lead instead of guessing. That combination — real answers plus an honest fallback — is the actual product.\n\nSell the difference explicitly. \"This isn't the button-tree thing you tried before\" is a sentence worth **saying out loud in the pitch**, not something you hope the prospect infers.",
      callout: {
        kind: "analogy",
        text: "Grounding is the chatbot taking an open-book exam instead of reciting from memory — it answers from the client's actual FAQ and price list sitting in front of it, not from a guess about what a business like this probably charges.",
      },
      diagram: {
        type: "compare",
        title: "2018 rule-tree widget vs. a grounded agent",
        left: {
          heading: "2018 rule-tree widget",
          items: ["Hardcoded button menu", "Keyword-match fallback", "Dead end on an unexpected question"],
        },
        right: {
          heading: "Grounded agent",
          items: [
            "Grounded on the client's real content",
            "Says \"I don't know\" and captures a lead",
            "Hands off to booking or a human",
          ],
        },
      },
    },
    {
      h2: "The spec: what makes it trustworthy",
      body: "A website chatbot worth deploying has five parts, and the order matters. First, it's **grounded** on the client's real content — their actual services, FAQ, and policies, not general knowledge about their industry. Second, lead capture is the fallback: when the bot doesn't know an answer, it asks for a name and number instead of inventing one.\n\nThird, it hands off to booking when the visitor is ready, so a good conversation can end in a calendar slot, not just a captured lead. Fourth, there's a human escalation path — a way for a real person to see the conversation and step in, especially for anything the bot flagged as uncertain.\n\nFifth, and this is the guardrail that actually earns trust: a hard rule against **inventing prices or promises**. If the bot doesn't have a documented price, it gives a range or says \"I'll have someone confirm that.\" It never makes one up.\n\nThe *Model Context Protocol* (MCP) project describes the standard this way: it lets AI applications \"connect to data sources... tools... and workflows\" so a model can act on real information instead of general training knowledge (modelcontextprotocol.io). That's the mechanism underneath grounding — the model isn't smarter than it was in 2018, it's connected to something true.\n\nWhat actually keeps a website chatbot honest is the knowledge files it's grounded on, not the underlying model. A great model given no content still guesses. A modest model given the client's real FAQ, priced services, and policies mostly just reads them back.",
      callout: {
        kind: "warning",
        text: "An answer that invents a price or a promise does more damage in one wrong reply than ten unanswered questions ever would. Test the no-invented-prices guardrail on purpose — ask it something it shouldn't know — before a client's customers do it for you.",
      },
      diagram: {
        type: "flow",
        title: "The five parts, in order",
        steps: [
          { label: "Grounded on real content", sub: "services, FAQ, policies" },
          { label: "Lead capture", sub: "fallback when it doesn't know" },
          { label: "Booking handoff", sub: "when the visitor's ready" },
          { label: "Human escalation", sub: "for anything flagged uncertain" },
          { label: "No invented prices", sub: "the trust guardrail" },
        ],
      },
    },
    {
      h2: "The build: DIY and assembled, both honestly",
      body: "You can build this yourself. The pieces are: an embeddable chat widget, a retrieval layer over the client's content (their site pages, a written FAQ doc, a policies doc), lead-capture wiring into wherever their leads already land, and a system prompt that spells out the no-invented-prices guardrail explicitly.\n\nNone of it is exotic. It's a genuinely buildable weekend project per client if you're comfortable with the retrieval and prompt-engineering pieces, and you keep full control of the stack.\n\nThe cost side is real but small. API usage for a chat-grounded assistant is priced per token by providers like Anthropic, and a typical visitor conversation is just a handful of short exchanges.\n\nThat's cheap enough that *BYOK* (bring your own key) usage for a single-business chatbot rarely becomes a line item worth worrying about (see Anthropic's published per-model token pricing at platform.claude.com/docs/en/about-claude/pricing for the actual rates). What doesn't stay cheap is your time: rebuilding the retrieval-and-guardrail wiring per client, and going back in every time the client's prices or hours change.\n\nThe other path: SeldonFrame builds a website chatbot grounded on the client's actual site content in one conversation, and it embeds on any site the client already has. Disclosed here as our product — so weigh this paragraph as the pitch it partly is.\n\nThe trade you're making by starting from an assembled base is **time for a monthly cost**, instead of build time for zero marginal cost. Which one is right depends on how many of these you're planning to sell, and how much you want your week to look like retrieval debugging versus client calls.",
    },
    {
      h2: "Selling it: the cheapest agent to say yes to",
      body: "Don't lead with the pitch — lead with the gap. Grade the prospect's current site (our [website grader](/tools/website-grader) is built for exactly this) and show them, concretely, the questions their site doesn't answer today: no visible price range, no clear service area, no FAQ a visitor can find without calling.\n\nThat gap is the sale. You're not asking them to imagine a hypothetical improvement — you're showing them the exact holes a grounded chatbot fills.\n\nA website chatbot is also **the easiest agent in your catalog to get a yes on**. It's visibly low-risk — it lives on a page they already have, and it doesn't touch their phone system.\n\nThe failure mode (a missed answer that becomes a captured lead) reads as an upgrade, not a liability, compared to what the page does today: nothing, if a question goes unanswered.\n\nOnce it's live and the client sees actual captured leads and answered questions in a report, that trust is your opening for the bigger upsell — a [phone receptionist](/guides/how-to-build-and-sell-an-ai-receptionist), full booking automation, or the retainer-level build. The chatbot is the **foot in the door**, not the whole deal.",
    },
    {
      h2: "Pricing and operating it",
      body: "Price a website chatbot below your voice or full-receptionist retainer. It's a lighter build with a narrower job, and pricing it that way makes it an easy add-on rather than a competing decision against your bigger offer.\n\nThe real, ongoing value isn't the initial build — it's the **content-refresh loop**. A chatbot grounded on stale content gives stale answers: wrong hours, an old price, a service the client stopped offering.\n\nA wrong answer erodes trust faster than no answer at all. Whatever cadence you commit to for reviewing and updating the client's knowledge content is the actual service you're being paid to keep running.\n\nA useful monthly report closes that loop, and gives the client (and you) a reason the retainer keeps making sense: conversations handled, leads captured, and — most valuable of all — the top questions the bot couldn't answer.\n\nThat last one isn't just a maintenance to-do; it's **raw material**. Feed it back into the client's FAQ page and you've improved both surfaces from one signal.",
    },
    {
      h2: "Failure modes to design against",
      body: "The classic failure is an ungrounded answer — the bot inventing a discount, a warranty term, or a price that isn't real because nothing stopped it from guessing. This is the single most reputation-damaging thing a chatbot can do: it turns \"helpful\" into \"actively wrong\" in front of a customer.\n\nThe guardrail from the spec section — never invent prices or promises, fall back to lead capture instead — exists specifically to prevent this. It's worth **testing on purpose** before you hand a build to a client.\n\nThe quieter failures are **knowledge rot** (the content the bot is grounded on goes stale and nobody notices until a customer complains), burying the human handoff (a bot that never makes it obvious how to reach a real person frustrates exactly the visitors who need one most), and treating the whole thing as fire-and-forget — building it once and never looking at the unanswered-questions log again.\n\nNone of these are technology problems. They're operating discipline, and they're exactly what a retainer is supposed to pay for.",
    },
  ],
  faq: [
    {
      q: "How is this different from the chat widgets businesses already hate?",
      a: "The old widgets were decision trees with a handful of hardcoded buttons and a keyword-match fallback — they broke the moment a visitor asked something unanticipated. A grounded chatbot is connected to the client's real content (services, FAQ, policies, hours) and answers in the visitor's own words, and when it genuinely doesn't know something, it captures a lead instead of guessing or dead-ending.",
    },
    {
      q: "What content does it need from the client?",
      a: "At minimum: their service list with prices or price ranges, hours, service area, and any policies worth stating (cancellation, guarantees, what's included). A written FAQ if they have one is the fastest starting point. The more specific and current this content is, the better the bot's answers — it's reading back what it's given, not inventing expertise.",
    },
    {
      q: "Can it book appointments, or just answer questions?",
      a: "Both, if you wire the handoff. Once a visitor's question is answered and they're ready, the bot can hand off to a booking flow rather than ending the conversation at a Q&A. Whether that's a full booking integration or a \"here's the link, want me to text it to you\" handoff depends on how the client's calendar is set up.",
    },
    {
      q: "What happens if it gives a wrong answer?",
      a: "The honest process, not a promise it can't happen: build the no-invented-answers guardrail in from the start, review the unanswered-questions log regularly (that log is also how you catch a wrong answer that got through), and fix the underlying knowledge content — not just the one bad response — so the same gap doesn't recur. A chatbot's accuracy is a property of the content it's grounded on and how often you maintain it, not a one-time build quality.",
    },
    {
      q: "How much should I charge for this versus a voice receptionist?",
      a: "Price it as the lighter offer — it's a narrower build (no phone system, no call handling) and a smaller monthly footprint. Treat it as the accessible add-on that opens the door to the bigger retainer, not a competitor to it on price.",
    },
  ],
  sources: [
    {
      label: "Model Context Protocol — \"What is the Model Context Protocol (MCP)?\"",
      url: "https://modelcontextprotocol.io/introduction",
    },
    {
      label: "Anthropic — Claude API pricing (per-model token rates)",
      url: "https://platform.claude.com/docs/en/about-claude/pricing",
    },
  ],
};
