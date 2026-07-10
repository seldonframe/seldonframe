import type { Guide } from "./types";

export const guide: Guide = {
  slug: "is-your-website-losing-you-jobs",
  title: "Is Your Website Losing You Jobs? The 7-Point Check",
  description:
    "A 7-point check for service business owners to see if their website is quietly costing them jobs — click-to-call, booking, a lead form, mobile speed, and more.",
  targetKeyword: "why is my website not getting customers",
  intent: "informational",
  cluster: "ai-visibility",
  relatedTool: "/tools/website-grader",
  dek: "A website that looks fine can still be losing you jobs every week — quietly, with no error message. Here are the 7 things that decide whether a visitor turns into a customer or just closes the tab, and how to check each one in a couple of minutes.",
  sections: [
    {
      h2: "1. Can someone call you in one tap?",
      body: "On a phone, the fastest path from \"interested\" to \"booked\" is a number they can tap without hunting for it. If your phone number is buried in a footer, shown only as an image, or not a clickable link, you're adding friction at the exact moment someone was ready to reach out.\n\nCheck it yourself: open your site on your phone and see how many taps it takes to call you from the homepage. It should be **one tap**. If it's more, that's an easy fix — and often the single **highest-impact fix on this list**, since most local searches happen on mobile.",
      diagram: {
        type: "flow",
        title: "Where visitors leak",
        steps: [
          { label: "Lands on your site" },
          { label: "Looks for how to reach you" },
          { label: "Can't find it fast", sub: "buried number, no link" },
          { label: "Leaves for a competitor" },
        ],
      },
    },
    {
      h2: "2. Can they book without waiting for you to reply?",
      body: "A contact form that just sends you an email means the customer is now waiting. Waiting is where a lot of interested people quietly go find someone else.\n\nIf booking requires them to hear back from you first, you're losing the people who wanted to lock in a time on the spot — especially outside your business hours.\n\nAn [online booking page](/guides/how-to-let-customers-book-online) or a widget that shows real open times fixes this. It doesn't replace the phone for people who want to talk first; it just stops you losing everyone who shows up after you've closed for the day.",
    },
    {
      h2: "3. Is there an actual lead form, not just an email address?",
      body: "A plain \"email us\" link puts the burden on the visitor to open their mail app, remember what they wanted to ask, and write it from scratch. A short form does that work for them.\n\nA **few fields** asking what they need and how to reach them is far more likely to get filled out than an email link.\n\nKeep it short. Research on form usability has found that **cutting unnecessary fields substantially raises how many people finish the form**, and forms following basic usability guidelines saw close to double the one-attempt completion rate of ones that didn't. Every extra field is a chance for someone to give up.",
    },
    {
      h2: "4. Does it load fast on mobile?",
      body: "Most local searches happen on a phone, often on the go, and patience is short. Google's own research found that **53% of mobile visitors will leave a page that takes longer than about three seconds to load**.\n\nThat means a slow site can be losing more than half its visitors before they ever see what you offer.\n\nA quick way to check: load your homepage on your phone using mobile data, not wifi, and time it. If it feels slow to you standing still, it will feel **slower to someone glancing at their phone between tasks**.",
    },
    {
      h2: "5. Does it say your city and services in plain words?",
      body: "Visitors and search engines both need to know, immediately, what you do and where you do it. A vague headline like \"Quality You Can Trust\" tells neither of them anything.\n\nSay the service and the city in the first screen. **\"Plumbing repairs in Springfield\" beats a slogan every time** — for a person skimming, and for a search engine trying to match you to a local query.\n\nThis also matters for *AI visibility* — how AI tools and voice assistants describe your business when someone asks them for a recommendation nearby. Vague pages are harder for those tools to summarize accurately. Our [AI visibility checker](/guides/how-to-show-up-in-ai-search) shows how your business currently comes across when asked about that way.",
      callout: {
        kind: "analogy",
        text: "AI visibility is a new employee who's only skimmed your window display describing your shop to a customer — the clearer and more literal your signage, the more accurately they describe you. Vague signage gets a vague, half-right description.",
      },
    },
    {
      h2: "6. Does it use LocalBusiness schema?",
      body: "*LocalBusiness schema* is a small block of structured data added to your site's code. It spells out your business name, hours, address, and category in a format search engines can read directly, rather than having to guess.\n\nGoogle documents this as the **basis for knowledge panels and local rich results** that show your hours and details right in the search results.\n\nMost visitors will never see this code, but it's part of why some local businesses show up with a rich, detailed search listing and others show up as a plain blue link. It's a **one-time technical fix**, usually handled by whoever built or hosts your site.",
      callout: {
        kind: "analogy",
        text: "LocalBusiness schema is filling out a labeled form instead of making a search engine read your details off a hand-written sign — it hands over your name, hours, and address in a format the machine can use directly, no guessing involved.",
      },
    },
    {
      h2: "7. Are your reviews visible, not just collected?",
      body: "Collecting reviews on Google is only half the job if your website itself shows no proof you're trusted. BrightLocal's ongoing consumer survey found that **97% of consumers read reviews** for local businesses, and **85% say positive reviews make them more likely to use one**.\n\nThat trust-building only helps you if a visitor actually sees it while they're on your site deciding.\n\nA handful of real reviews, with names and specifics, placed near your booking button or contact form, does more for confidence than a generic \"trusted by hundreds\" line. If you already have reviews sitting on Google, [pulling a few onto your homepage](/guides/how-to-get-more-google-reviews) is usually a small change with an outsized effect.",
      diagram: {
        type: "bars",
        title: "What BrightLocal's survey found about reviews",
        items: [
          { label: "Read reviews for local businesses", value: 97, display: "97%" },
          { label: "Say positive reviews increase likelihood of use", value: 85, display: "85%" },
        ],
        note: "From BrightLocal's Local Consumer Review Survey — this only helps you if a visitor sees the proof while they're on your site.",
      },
    },
  ],
  faq: [
    {
      q: "How do I know if my website is actually losing me jobs?",
      a: "Walk through the 7 points above as if you were a new customer on your phone: can you call in one tap, book without waiting, fill a short form, load fast, tell what you do and where, and see real reviews? Or run our free website grader, which checks these automatically and shows you exactly what's missing.",
    },
    {
      q: "Which of the 7 points matters most?",
      a: "For most local service businesses it's click-to-call and mobile load speed, since the bulk of traffic is someone on a phone deciding in seconds whether to stay. But a site that's fast and callable can still lose jobs if there's no way to book outside business hours — so treat this as a full checklist, not a pick-one.",
    },
    {
      q: "Do I need to rebuild my whole website to fix these?",
      a: "Usually not. Click-to-call, a short lead form, a booking link, and visible reviews can typically be added to an existing site without a redesign. Schema markup and load speed sometimes need a developer or your website host, but they're still targeted fixes, not a rebuild.",
    },
  ],
  sources: [
    {
      label: "Nielsen Norman Group — \"Website Forms Usability: Top 10 Recommendations\"",
      url: "https://www.nngroup.com/articles/web-form-design/",
    },
    {
      label: "Marketing Dive — \"Google: 53% of mobile users abandon sites that take over 3 seconds to load\"",
      url: "https://www.marketingdive.com/news/google-53-of-mobile-users-abandon-sites-that-take-over-3-seconds-to-load/426070/",
    },
    {
      label: "Google Search Central — LocalBusiness structured data documentation",
      url: "https://developers.google.com/search/docs/appearance/structured-data/local-business",
    },
    {
      label: "BrightLocal — Local Consumer Review Survey",
      url: "https://www.brightlocal.com/research/local-consumer-review-survey/",
    },
  ],
};
