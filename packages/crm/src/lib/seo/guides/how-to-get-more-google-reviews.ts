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
      body: "The gap almost never comes from customers who don't like you.\n\nIt comes from customers who **meant to leave a review**, closed the tab, and never came back. Asking someone to \"search us on Google, click the right listing, scroll to reviews, then click write a review\" is four steps too many.\n\nThat whole thing takes ten seconds once you're actually in the review box. The problem is getting there.\n\nGoogle's own guidance for business owners is direct about the fix: you can ask customers to visit a Google link or scan a QR code that **opens the review box immediately**, skipping the search-and-scroll entirely.\n\nRemoving steps is the single highest-leverage change most businesses can make to their review volume.",
      callout: {
        kind: "tip",
        text: "If you only change one thing after reading this guide, make it the link. Everything else — timing, wording — matters less than whether the customer has to search for you first.",
      },
    },
    {
      h2: "The direct-link trick",
      body: "Every Google Business Profile has a direct \"write a review\" link. It's built from the profile's Place ID, in the form https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID.\n\nShare that link — or a QR code that points to it — and a customer lands **straight in the review box with one tap**. Doesn't matter if they're standing at checkout or reading a follow-up text that evening.\n\nOur [Google review link generator](/tools/google-review-link-generator) builds that link and a printable QR code from your Place ID or Maps URL. Takes a few seconds, free, no signup.",
      callout: {
        kind: "analogy",
        text: "A Place ID is like a business's private ID number inside Google Maps — not something a customer ever sees, but plug it into the right URL and it points Google straight at your exact listing's review box, no searching required.",
      },
      diagram: {
        type: "compare",
        title: "Asking without a link vs. asking with one",
        left: {
          heading: "Generic ask",
          items: ["\"Leave us a review on Google!\"", "Customer opens Google, searches your name", "Finds the wrong listing or gives up", "Review never gets written"],
        },
        right: {
          heading: "Direct-link ask",
          items: ["Text or QR code with the link", "One tap opens the review box", "Customer writes the review right there", "Review posted in under a minute"],
        },
      },
    },
    {
      h2: "When and how to ask",
      body: "Timing matters more than wording.\n\nAsk right after a **moment of visible satisfaction** — the job is finished and looks good, the appointment went well, the order just arrived. Not days later, when the feeling has faded.\n\nA text message with the direct link, sent within a few hours of the job, consistently outperforms a generic follow-up email sent a week later.\n\nKeep the ask short and specific. Thank them, name the job or service so it's clearly personal, and hand them the one-tap link.\n\n\"Thanks for having us out today — if you have 20 seconds, a Google review helps other homeowners find us: [link]\" does more work than a longer, more formal request.",
    },
    {
      h2: "What Google's rules actually allow",
      body: "You're allowed to ask any real customer for a review, and to make it easy with a link or QR code. That's explicitly encouraged in Google's guidance for business owners.\n\nWhat you **can't** do: offer incentives (discounts, gift cards, entries into a drawing) in exchange for a review, review only your happiest customers while filtering out others (\"review gating\"), or post reviews on your own business's behalf.\n\nAsk everyone the same way, and let the reviews land where they land.",
      callout: {
        kind: "warning",
        text: "Review gating — asking happy customers to post publicly while quietly routing unhappy ones to a private form — feels tempting but breaks Google's rules. Ask every customer the identical way, every time.",
      },
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
      a: "Yes — Google's guidance recommends personalized replies over generic thank-yous, especially for reviews where you can add something useful. See our guide on [responding to a negative review](/guides/how-to-respond-to-a-negative-review) for the harder case.",
    },
  ],
  sources: [
    {
      label: "Google Business Profile Help — \"Read and reply to reviews\"",
      url: "https://support.google.com/business/answer/3474122",
    },
  ],
};
