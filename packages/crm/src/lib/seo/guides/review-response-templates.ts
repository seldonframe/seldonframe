import type { Guide } from "./types";

export const guide: Guide = {
  slug: "review-response-templates",
  title: "Review Response Templates (Copy-Paste for Every Star Rating)",
  description:
    "Ready-to-use review response templates for 5-star, detailed positive, negative, neutral, and no-comment reviews — plus the 3 rules that make any response good.",
  targetKeyword: "review response templates",
  intent: "informational",
  cluster: "reviews",
  relatedTool: "/tools/review-response-generator",
  dek: "When you don't know what to write back, use a template built for the star rating you got: thank them, add one specific detail, and — if it's negative — move the conversation offline. The templates below cover every common case.",
  sections: [
    {
      h2: "Why every review deserves a reply",
      body: "A review response isn't only for the person who left it. **Future customers read replies** before they read much else on your listing, and a business that never responds looks like nobody's paying attention.\n\nSpeed matters more than most owners think. According to *ReviewTrackers*, 53% of customers expect a response to a negative review within a week, and one in three expect it within three days or less.\n\nThe good news is you rarely need to write from scratch. A small set of templates covers almost every situation — you just swap in the specific details each time.",
      callout: {
        kind: "tip",
        text: "Never send a template exactly as written. Add one real, specific detail — the technician's name, the service performed, the exact word the customer used — or it reads like a form letter and loses most of its value.",
      },
    },
    {
      h2: "The 3 rules behind every good response",
      body: "**Respond fast.** A reply within a day or two, while the experience is still fresh, reads as attentive. A reply three weeks later reads as an afterthought — even if the words are identical.\n\n**Personalize with a specific detail.** Naming the job, the product, or something the reviewer actually said proves a human read it. \"Thanks for the kind words\" on every single review is the fastest way to look automated.\n\n**Move disputes offline.** Never argue the facts of a complaint in public. Apologize for the experience, invite them to a phone number or email, and finish the disagreement somewhere the next customer can't watch it unfold.",
      diagram: {
        type: "compare",
        title: "Generic reply vs. a good reply",
        left: {
          heading: "Generic reply",
          items: ["\"Thanks for your review!\"", "Same wording on every review", "No specific detail mentioned", "Negative reviews argued in public"],
        },
        right: {
          heading: "Good reply",
          items: ["Sent within a day or two", "Names the job or the detail they mentioned", "Reads like it was written by a person", "Disputes moved to phone or email"],
        },
      },
    },
    {
      h2: "Templates for positive reviews",
      body: "Positive reviews still deserve more than \"thanks!\" — a short, specific reply turns a happy customer into a repeat one and shows future readers you're paying attention.\n\nFor a quick 5-star with no comment, keep it short and specific to the service:\n\n\"Thanks so much for the 5 stars, [customer name]! We're glad the [service/job] worked out, and we'd love to help again whenever you need us — see you next time.\"\n\nFor a detailed positive review that mentions specifics, mirror those details back:\n\n\"Thank you for the detailed review, [customer name] — it means a lot. We're thrilled [specific detail they mentioned, e.g. 'the team showed up early and cleaned up after'] stood out, and we'll be sure to pass that along to [staff name/the team]. Looking forward to working with you again.\"",
    },
    {
      h2: "Templates for negative, neutral, and no-comment reviews",
      body: "A negative review is the highest-stakes reply you'll write, so keep it calm, brief, and offline-bound:\n\n\"Hi [customer name], thank you for the honest feedback, and I'm sorry the [issue mentioned] didn't meet the mark. That's not the experience we want anyone to have. Could you email us at [contact email] or call [phone number] so we can make it right?\"\n\nA neutral 3-star review usually means \"fine, not great\" — invite specifics without sounding defensive:\n\n\"Thanks for taking the time to leave a review, [customer name]. We'd love to know what would have made it a 5-star experience — feel free to reach out at [contact email], and we'll use it to improve.\"\n\nA star-only rating with no written comment still deserves a reply, just a lighter one:\n\n\"Thanks for the rating, [customer name] — we appreciate you taking the time. If anything about your visit could have gone better, we're always happy to hear it at [contact email].\"",
    },
  ],
  faq: [
    {
      q: "What should I write when responding to a review?",
      a: "Thank the customer by name, add one specific detail about their visit or job so it doesn't read like a form letter, and — for negative reviews — apologize for the experience and invite them to continue by phone or email rather than arguing details in public.",
    },
    {
      q: "Should I respond to positive reviews, or just negative ones?",
      a: "Respond to all of them. Positive replies reinforce the relationship and show future customers the business is attentive; skipping them and only replying to complaints makes the negative reviews stand out even more.",
    },
    {
      q: "How fast should I respond to a review?",
      a: "Within a day or two if you can manage it. ReviewTrackers found 53% of customers expect a reply to a negative review within a week, and a third expect one within three days or less — waiting longer reads as not paying attention.",
    },
  ],
  sources: [
    {
      label: "Google Business Profile Help — \"Read and reply to reviews\"",
      url: "https://support.google.com/business/answer/3474122",
    },
    {
      label: "ReviewTrackers — Online Reviews Survey (consumer response-time expectations)",
      url: "https://www.reviewtrackers.com/reports/online-reviews-survey/",
    },
  ],
};
