import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-respond-to-a-negative-review",
  title: "How to Respond to a Negative Review (Without Making It Worse)",
  description:
    "A negative review is public and permanent, but your reply is too — and it's often read by more people than the review itself. Here's how to respond well, with real examples.",
  targetKeyword: "how to respond to a negative review",
  intent: "informational",
  cluster: "reviews",
  relatedTool: "/tools/review-response-generator",
  dek: "A one-star review feels like the end of the conversation. It isn't — your reply is the next thing a prospective customer reads, and a calm, specific response often does more for your reputation than the review does damage.",
  sections: [
    {
      h2: "Why the reply matters more than the review",
      body: "Someone comparing businesses rarely stops at the star average. They read the worst review. Then they read how the business replied.\n\nA defensive or generic reply just **confirms the complaint**. Silence confirms it too.\n\nA calm, specific reply does something different. It tells every future reader that this business **shows up when things go wrong** — often exactly what a nervous buyer needs to see.\n\nGoogle's own guidance for business owners backs this up. It says replies should be personal, not templated: **acknowledge the specific issue**, skip the boilerplate, and treat a negative review as a chance to show how you handle problems in public.\n\nIf you'd rather have reviews come in on their own, see [how to build a review request agent](/guides/how-to-build-a-review-request-agent).",
      diagram: {
        type: "compare",
        title: "Two ways to reply",
        left: { heading: "Defensive or silent", items: ["Defensive reply", "Generic template", "No reply at all"] },
        right: { heading: "Calm and specific", items: ["Names the actual issue", "Personal, not templated", "Shows up when things go wrong"] },
      },
    },
    {
      h2: "The structure that works",
      body: "There are four moves, in order. **Acknowledge the specific complaint** — not a vague \"sorry you had a bad experience.\" Then apologize for the part that's genuinely on you.\n\nNext, say briefly **what you did or will do about it**. Last, invite them to continue offline if it needs more detail.\n\nSkip the urge to relitigate the story in public. A reader doesn't need a paragraph of context — they need to see you took it seriously.\n\nWhat to avoid: arguing the facts, blaming the customer, or copy-pasting the same three sentences on every review. Going silent for weeks is its own mistake.\n\nSpeed matters almost as much as tone. A reply within a day or two reads as **attentive**; a reply a month later reads as an afterthought.",
      diagram: {
        type: "flow",
        title: "The four-move reply",
        steps: [
          { label: "Acknowledge", sub: "the specific complaint" },
          { label: "Apologize", sub: "for what's on you" },
          { label: "State the fix", sub: "briefly" },
          { label: "Invite offline", sub: "for anything bigger" },
        ],
      },
      callout: {
        kind: "tip",
        text: "Speed is part of the message. A reply within a day or two reads as attentive; the exact same reply a month late reads like nobody's watching the reviews at all.",
      },
    },
    {
      h2: "When the review is unfair or fake",
      body: "Respond calmly and factually anyway. Your reply isn't really for the reviewer — it's for everyone else reading it.\n\nState the facts you can verify: dates, what was actually delivered. Don't accuse the reviewer of lying, even if you think they are.\n\nThat argument almost always **looks worse to a third-party reader** than the original review did.\n\nIf a review breaks Google's content policies — it's fake, it's spam, or it's about the wrong business — you can **flag it for removal** through your *Business Profile*. But don't lean on removal as your main plan: **most negative reviews don't qualify**, so plan around answering well instead.\n\nIf you're also trying to get more reviews in the first place, see [how to get more Google reviews](/guides/how-to-get-more-google-reviews).",
      callout: {
        kind: "analogy",
        text: "Flagging a review through your Business Profile is like reporting a comment to a moderator — it only comes down if it actually breaks a rule, not just because you disagree with it.",
      },
    },
  ],
  faq: [
    {
      q: "Should I respond to every negative review?",
      a: "Yes — and quickly. An unanswered negative review is the worst outcome you can have: it looks like nobody's paying attention. Even a short, specific reply changes how the whole review reads to the next person who finds it.",
    },
    {
      q: "Can I get a negative review taken down?",
      a: "Only if it breaks Google's policies — fake, spam, off-topic, or about the wrong business. You can flag it from your Business Profile. A review that's just unflattering but genuine won't come down, so plan on answering it well instead of getting it deleted.",
    },
    {
      q: "What if the customer is just wrong?",
      a: "State the facts calmly, without calling them out directly. Future readers — not the reviewer — are your real audience. A composed, factual reply to an unfair review usually builds more trust than winning the argument ever would.",
    },
  ],
  sources: [
    {
      label: "Google Business Profile Help — \"Read and reply to reviews\"",
      url: "https://support.google.com/business/answer/3474122",
    },
  ],
};
