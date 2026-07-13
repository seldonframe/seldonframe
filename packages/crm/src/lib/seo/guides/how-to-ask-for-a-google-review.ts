import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-ask-for-a-google-review",
  title: "How to Ask for a Google Review (Copy-Paste Scripts Included)",
  description:
    "The exact words to use when asking a customer for a Google review — in person, by text, and by email — plus the best moment to ask, one follow-up, and what Google's rules forbid.",
  targetKeyword: "how to ask for a google review",
  intent: "informational",
  cluster: "reviews",
  relatedTool: "/tools/google-review-link-generator",
  dek: "The best way to ask a customer for a Google review is right after a good outcome, with a direct link that skips the search-and-scroll, and a short, specific ask. Below are copy-paste scripts for in-person, text, and email — plus the one follow-up that's worth sending.",
  sections: [
    {
      h2: "The moment to ask",
      body: "Ask **while the customer is still happy** — not a week later. The best window is right after a visible good outcome: the job just finished and looks great, the appointment went smoothly, the order just arrived intact.\n\nThat's when the experience is freshest and the customer is most willing to spend twenty seconds on you. Waiting until \"a good time\" usually means waiting until the feeling has faded and the ask becomes an interruption instead of a natural next step.\n\nIf you can't ask in person, the next-best window is **within a few hours** of the job finishing, while it's still top of mind.",
      diagram: {
        type: "flow",
        title: "The ask sequence",
        steps: [
          { label: "Good outcome happens", sub: "job finishes, appointment goes well" },
          { label: "Ask within hours", sub: "in person, text, or email" },
          { label: "Send the direct link", sub: "skips search-and-scroll" },
          { label: "One follow-up only", sub: "if no response after a few days" },
        ],
      },
    },
    {
      h2: "Why the direct link matters",
      body: "Asking someone to \"leave us a review on Google\" without a link means they have to search your business name, find the right listing among lookalikes, scroll to the reviews tab, then tap **write a review**. That's four steps most people abandon halfway through.\n\nA *direct review link* (built from your Google Business Profile's Place ID) skips straight to the review box — one tap and they're typing. Our [Google review link generator](/tools/google-review-link-generator) builds that link or a printable QR code from your Place ID or Maps URL in a few seconds.\n\n**Always attach the link to the ask.** The wording matters less than whether the customer has to hunt for your listing first.",
      callout: {
        kind: "tip",
        text: "Save the direct link as a text-message template or a QR code on a receipt. The fastest asks are the ones that don't require you to type anything new each time.",
      },
    },
    {
      h2: "Copy-paste scripts by channel",
      body: "Match the script to how you're already talking to the customer — don't switch channels just to ask.\n\n**In person:** \"That looks great — glad we could get it sorted today. If you've got twenty seconds, a Google review really helps other folks find us. I can text you the link right now if that's easier.\"\n\n**Text (send within a few hours):** \"Hi [name], thanks again for having us out for the [job/service] today! If you have a minute, we'd really appreciate a Google review: [link]\"\n\n**Email:** Subject: \"Thanks for choosing [business name]\" — Body: \"Hi [name], thank you for your business — it was a pleasure helping with your [job/service]. If you have a moment, we'd be grateful for a quick Google review; it helps other customers find us and means a lot to our team: [link]\"\n\nKeep every version **short, specific to the job**, and ending with the direct link — not a generic \"check us out on Google.\"",
    },
    {
      h2: "The one follow-up (and when to stop)",
      body: "If a customer hasn't left a review after your first ask, **one polite follow-up** a few days to a week later is reasonable. After that, let it go — repeated asks read as pressure, not friendliness, and can push a happy customer toward an annoyed one.\n\nA simple follow-up text: \"Hi [name], just following up in case our last message got buried — no pressure at all, but if you have a moment, here's that Google review link again: [link]. Thanks either way!\"\n\nTrack who you've asked so you don't accidentally ask the same customer twice in the same week across different channels (text and email at once, for example).",
      callout: {
        kind: "analogy",
        text: "One follow-up is a gentle tap on the shoulder. A third or fourth reminder starts to feel like a tug on the sleeve — it changes how the ask lands even if the words stay polite.",
      },
    },
    {
      h2: "What Google's rules don't allow",
      body: "You can ask any real customer for a review and make it easy with a direct link or QR code — Google's own guidance for business owners explicitly encourages this.\n\nWhat's against the rules: **offering incentives** — discounts, gift cards, free goods or services — in exchange for a review, changing a review, or removing a negative one. Also against the rules: **review gating**, meaning discouraging negative reviews or *selectively soliciting* positive ones (asking only your happiest customers to post publicly while quietly routing others elsewhere).\n\nThe fix is simple: **ask every customer the same way**, using the same script, regardless of how the job went. Let the reviews land where they land.",
      callout: {
        kind: "warning",
        text: "Never gate your ask to only happy-looking customers, and never offer anything — a discount, a gift card, an entry into a drawing — in exchange for a review. Both are explicitly prohibited by Google's policies.",
      },
    },
  ],
  faq: [
    {
      q: "What's the best time to ask for a Google review?",
      a: "Right after a visible good outcome — the job just finished, the appointment went well — while the customer is still happy. If you can't ask in person, send the request within a few hours by text or email, before the feeling fades.",
    },
    {
      q: "What should I say when asking for a Google review?",
      a: "Keep it short and specific to the job: thank them by name, mention the service, and attach the direct review link. For example: \"Thanks again for having us out today — if you have 20 seconds, a Google review helps other homeowners find us: [link].\"",
    },
    {
      q: "Is it against the rules to only ask happy customers for a review?",
      a: "Yes. Google's policies prohibit \"review gating\" — discouraging negative reviews or selectively soliciting positive ones. Ask every customer the same way, regardless of how satisfied they seemed.",
    },
    {
      q: "Can I offer a discount in exchange for a Google review?",
      a: "No. Google's policies explicitly prohibit offering incentives — payment, discounts, or free goods or services — in exchange for posting, changing, or removing a review.",
    },
  ],
  sources: [
    {
      label: "Google Business Profile Help — \"Guidelines for Google reviews\" (prohibited and restricted content)",
      url: "https://support.google.com/business/answer/2622994",
    },
    {
      label: "Google Business Profile Help — \"Read and reply to reviews\" (requesting reviews via link or QR code)",
      url: "https://support.google.com/business/answer/3474122",
    },
  ],
};
