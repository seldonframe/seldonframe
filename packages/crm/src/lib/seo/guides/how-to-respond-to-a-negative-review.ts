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
      body: "Someone comparing businesses rarely reads only the star average. They read the worst review, and then they read how the business responded. A defensive, generic, or absent reply confirms the complaint. A calm, specific one tells every future reader that this business shows up when things go wrong — which is often the exact reassurance a nervous buyer needs.\n\nGoogle's own guidance for business owners is explicit that replies should be personal rather than templated: acknowledge the specific issue, don't send the same boilerplate to every reviewer, and treat a negative review as a chance to demonstrate how you handle problems in public.",
    },
    {
      h2: "The structure that works",
      body: "Four moves, in order: acknowledge the specific complaint (not a vague \"sorry you had a bad experience\"), apologize for the part that's genuinely on you, state briefly what you did or will do about it, and invite them offline for anything that needs more detail. Skip the urge to relitigate the story in public — a reader doesn't need a paragraph of context, they need to see that you took it seriously.\n\nWhat to avoid: arguing the facts in the reply, blaming the customer, copy-pasting the same three sentences on every review, or going silent for weeks. Speed matters almost as much as tone — a reply within a day or two reads as attentive; a reply a month later reads as an afterthought.",
    },
    {
      h2: "When the review is unfair or fake",
      body: "Respond calmly and factually anyway — your reply is for the audience reading it, not just the reviewer. State the facts you can verify (dates, what was actually delivered) without accusing the reviewer of lying, since that argument almost always looks worse to a third-party reader than the original review. If a review violates Google's content policies (it's fake, it's spam, or it's about a different business), you can flag it for removal through your Business Profile — but don't rely on removal as your main strategy, since most negative reviews don't qualify.",
    },
  ],
  faq: [
    {
      q: "Should I respond to every negative review?",
      a: "Yes, and quickly. An unanswered negative review is the worst outcome — it looks like nobody's paying attention. Even a short, specific reply changes how the whole review reads to the next person who finds it.",
    },
    {
      q: "Can I get a negative review taken down?",
      a: "Only if it violates Google's policies (fake, spam, off-topic, or about the wrong business) — you can flag it from your Business Profile. A review that's simply unflattering but genuine won't be removed, so plan around answering it well rather than getting it deleted.",
    },
    {
      q: "What if the customer is just wrong?",
      a: "State the facts calmly without calling them out directly — future readers, not the reviewer, are your real audience. A composed, factual reply to an unfair review usually builds more trust than winning the argument would.",
    },
  ],
  sources: [
    {
      label: "Google Business Profile Help — \"Read and reply to reviews\"",
      url: "https://support.google.com/business/answer/3474122",
    },
  ],
};
