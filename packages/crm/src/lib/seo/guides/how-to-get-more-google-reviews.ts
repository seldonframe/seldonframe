import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-get-more-google-reviews",
  title: "How to Get More Google Reviews (Without Feeling Pushy)",
  description:
    "A practical playbook for getting more Google reviews: the direct-link trick that removes the biggest friction point, when to ask, what to say, and what Google's own rules allow.",
  targetKeyword: "how to get more google reviews",
  intent: "informational",
  cluster: "reviews",
  relatedTool: "/tools/google-review-link-generator",
  dek: "Most happy customers would leave you a review — they just never get around to searching for your business on Google and finding the review box. Fix that one piece of friction and the rest is timing and asking.",
  sections: [
    {
      h2: "Why most businesses have fewer reviews than happy customers",
      body: "The gap almost never comes from customers who don't like you. It comes from customers who meant to leave a review, closed the tab, and never came back. Asking someone to \"search us on Google, click the right listing, scroll to reviews, then click write a review\" is four steps too many for something that takes ten seconds once you're actually in the review box.\n\nGoogle's own guidance for business owners is direct about the fix: you can ask customers to visit a Google link or scan a QR code that opens the review box immediately, skipping the search-and-scroll entirely. Removing steps is the single highest-leverage change most businesses can make to their review volume.",
    },
    {
      h2: "The direct-link trick",
      body: "Every Google Business Profile has a direct \"write a review\" link built from its Place ID, in the form https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID. Share that link — or a QR code that points to it — and a customer lands straight in the review box with one tap, whether they're standing at checkout or reading a follow-up text that evening.\n\nOur google review link generator builds that link and a printable QR code from your Place ID or Maps URL in a few seconds, free, with no signup.",
    },
    {
      h2: "When and how to ask",
      body: "Timing matters more than wording. Ask right after a moment of visible satisfaction — the job is finished and looks good, the appointment went well, the order just arrived — not days later when the feeling has faded. A text message with the direct link, sent within a few hours of the job, consistently outperforms a generic follow-up email sent a week later.\n\nKeep the ask short and specific: thank them, name the job or service so it's clearly personal, and hand them the one-tap link. \"Thanks for having us out today — if you have 20 seconds, a Google review helps other homeowners find us: [link]\" does more work than a longer, more formal request.",
    },
    {
      h2: "What Google's rules actually allow",
      body: "You're allowed to ask any real customer for a review and to make it easy with a link or QR code — that's explicitly encouraged in Google's guidance for business owners. What you can't do is offer incentives (discounts, gift cards, entries into a drawing) in exchange for a review, review only your happiest customers while filtering out others (\"review gating\"), or post reviews on your own business's behalf. Ask everyone the same way, and let the reviews land where they land.",
    },
  ],
  faq: [
    {
      q: "Is it okay to ask customers for a Google review?",
      a: "Yes. Google's own business guidance encourages it, and explicitly suggests sharing a direct link or QR code to make it easy. What's against the rules is paying for reviews, offering incentives, or only asking customers you expect to leave a 5-star review.",
    },
    {
      q: "What's the fastest way to get more reviews?",
      a: "Remove the search-and-scroll step. Get your direct review link (built from your Google Business Profile's Place ID) or a QR code, and send it the same day as the job — by text if you have the customer's number, since texts get opened faster than email.",
    },
    {
      q: "Should I respond to reviews once I start getting more of them?",
      a: "Yes — Google's guidance recommends personalized replies over generic thank-yous, especially for reviews where you can add something useful. See our guide on responding to a negative review for the harder case.",
    },
  ],
  sources: [
    {
      label: "Google Business Profile Help — \"Read and reply to reviews\"",
      url: "https://support.google.com/business/answer/3474122",
    },
  ],
};
