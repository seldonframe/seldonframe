import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-get-your-business-recommended-by-chatgpt",
  title: "How to Get Your Business Recommended by ChatGPT",
  description:
    "There's no way to buy your way into ChatGPT's answers. Here's how ChatGPT actually finds and cites businesses — and the honest steps that improve your odds.",
  targetKeyword: "how to get your business recommended by chatgpt",
  intent: "informational",
  cluster: "ai-visibility",
  relatedTool: "/tools/ai-visibility-checker",
  relatedBest: "/best/ai-agent-for-small-business",
  relatedChart: { href: "/charts/ai-recommendation-index", label: "See the industry-wide version: what AI recommends across 10 buyer questions" },
  dek: "More people now ask ChatGPT things like \"who's a good plumber near me\" or \"best bookkeeper for a small restaurant.\" There is no ad slot and no submission form that puts you in those answers. But you can understand how ChatGPT sources businesses and make yourself far more likely to be the one it names — without falling for the tricks being sold as shortcuts.",
  sections: [
    {
      h2: "How ChatGPT actually finds businesses",
      body: "It helps to separate **two things** ChatGPT does.\n\nWhen it answers purely from its training data, it's drawing on a fixed snapshot of the web from months earlier. A brand-new business may simply not exist to it yet.\n\nWhen it uses its search feature instead, it retrieves live web results, then summarizes and *cites* them with links.\n\nAccording to OpenAI's own documentation, ChatGPT search pulls from web sources, including its own crawler (OAI-SearchBot) and, through OpenAI's partnership with Microsoft, the Bing search index.\n\nThe practical implication: **whether the web thinks your business exists**, and whether you're indexed and findable, directly shapes whether ChatGPT can mention you at all. If you're invisible to search engines, you're usually invisible to ChatGPT too. (See [what generative engine optimization actually means](/guides/what-is-generative-engine-optimization) for the broader picture.)",
      callout: {
        kind: "analogy",
        text: "A citation is a footnote in a school essay: it points to where the claim came from, so the reader can check it. When ChatGPT search cites your site, it's telling the user \"here's my source\" — which is exactly why being a source it can find and trust matters so much.",
      },
      diagram: {
        type: "compare",
        title: "Two different ChatGPT answers",
        left: {
          heading: "Answering from training data",
          items: ["Fixed snapshot from months earlier", "No live lookup", "New businesses may not exist to it"],
        },
        right: {
          heading: "Answering with search on",
          items: ["Retrieves live web results", "Summarizes and cites sources", "Needs you to be indexed and findable"],
        },
      },
    },
    {
      h2: "Why search visibility still matters (especially Bing)",
      body: "Because ChatGPT search leans on the Bing index, **ordinary search visibility isn't optional**.\n\nOne analysis by the agency Seer Interactive found that around 87 percent of the citations in OpenAI's SearchGPT matched Bing's top organic results — a much higher overlap than with Google.\n\nWorth noting: the researchers describe this as a limited, directional study of roughly 100 queries, not a settled law. Treat the exact number as a signal rather than a guarantee.\n\nStill, the direction is clear and actionable. Making sure your site is indexed in Bing (via Bing Webmaster Tools), not just Google, is one of the few concrete, verifiable things you can do.\n\nCombined with a **complete Google Business Profile** and accurate listings, it gives the answer engines real, current material to draw on.",
    },
    {
      h2: "Be the business that's easy to recommend",
      body: "A model recommends what it can describe confidently.\n\nThat means your name, category, location, services, and hours should be **accurate and consistent** everywhere they appear — your website, Google Business Profile, directories, and review sites.\n\nContradictory or outdated information makes a model hesitant to name you. Worse, it can cause the model to state something wrong about you.\n\nReviews and third-party mentions matter here too. Generative engines lean toward businesses that **others talk about**, so genuine reviews, local press, and being listed in reputable directories all give a model reasons to surface you.\n\nThere's no schema trick that substitutes for actually being a well-regarded, clearly-described business online.",
      callout: {
        kind: "tip",
        text: "Copy-paste your name, address, and hours instead of retyping them on each listing — a single typo repeated across directories is how a phantom location or a wrong closing time ends up in an AI answer.",
      },
    },
    {
      h2: "Check what ChatGPT says about you today",
      body: "Before optimizing anything, find out where you stand.\n\nAsk ChatGPT — with search on and off — about your category in your city and see whether you're mentioned. Then ask it directly about your business to see whether the details are right.\n\nIt's common to find you're absent, or that the model repeats an old address or a service you dropped.\n\nOur [AI visibility checker](/tools/ai-visibility-checker) automates that first look: it shows how AI assistants currently describe your business so you know exactly what to fix.\n\nBe realistic, though: **you cannot force or pay** your way into ChatGPT's recommendations, and anyone promising guaranteed placement is selling something these systems don't offer.\n\nThe honest path is to be genuinely findable, accurate, and worth recommending, then recheck over time. (More step-by-step tactics live in [how to show up in AI search](/guides/how-to-show-up-in-ai-search).)",
      diagram: {
        type: "flow",
        title: "The honest check-and-fix loop",
        steps: [
          { label: "Ask with search off", sub: "what does training data say?" },
          { label: "Ask with search on", sub: "what does it cite today?" },
          { label: "Compare to reality", sub: "name, hours, services, location" },
          { label: "Fix the wrong listing", sub: "then recheck later" },
        ],
      },
    },
  ],
  faq: [
    {
      q: "Can I pay to get my business into ChatGPT's answers?",
      a: "No. There's no ad unit or paid placement inside ChatGPT's organic answers, and no submission form that guarantees inclusion. Anyone claiming they can buy you a spot is misrepresenting how these systems work. You influence your odds indirectly by being findable, accurate, and well-regarded online.",
    },
    {
      q: "Why does ChatGPT not know my business exists?",
      a: "Usually one of two reasons: your business is newer than the model's training snapshot, or you're not well-indexed and cited on the web that ChatGPT's search feature draws from. Getting indexed (including in Bing, which ChatGPT search relies on heavily), completing your Google Business Profile, and earning genuine mentions all help.",
    },
    {
      q: "Does my Google ranking affect ChatGPT?",
      a: "Only indirectly. ChatGPT search leans on the Bing index rather than Google's, so strong Google rankings don't automatically carry over. Making sure you're indexed and findable in Bing, and accurate across your listings, is a more direct lever for ChatGPT visibility.",
    },
  ],
  sources: [
    {
      label: "OpenAI Help Center — “ChatGPT Search”",
      url: "https://help.openai.com/en/articles/9237897-chatgpt-search",
    },
    {
      label:
        "Seer Interactive — “87% of SearchGPT Citations Match Bing’s Top Results” (limited, directional study)",
      url: "https://www.seerinteractive.com/insights/87-percent-of-searchgpt-citations-match-bings-top-results",
    },
    {
      label:
        "Google Search Central — “Optimizing your website for generative AI features on Google Search”",
      url: "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
    },
  ],
};
