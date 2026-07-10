import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-make-a-website-for-a-service-business",
  title: "How to Make a Website for a Service Business (Free, in Minutes)",
  description:
    "An honest walkthrough of the ways to make a website for a service business — DIY builders, hiring out, and AI generators — plus the 7 things it actually needs.",
  targetKeyword: "how to make a website for my small business",
  intent: "informational",
  cluster: "ai-visibility",
  relatedTool: "/tools/ai-website-generator",
  dek: "Making a website for a service business used to mean picking a builder, learning it, and spending a weekend dragging boxes around — or paying someone else to.\n\nThere's now a faster path. But it's worth knowing all three options honestly before you pick one.",
  sections: [
    {
      h2: "Option 1: DIY website builders",
      body: "**Drag-and-drop builders** are the most familiar option — the general-purpose, template kind. You pick a template, swap in your photos and text, and publish.\n\nThe upside is real: you get **full control**, and the starting cost is low.\n\nThe real cost is time and skill, not money. Even a simple builder has a learning curve.\n\nGetting a page that looks right on mobile, loads fast, and follows basic usability practices takes more fiddling than most people expect.\n\nThis is a good choice if you enjoy the process, or have specific design needs. It's a **weaker choice if you just need something live this week**.",
    },
    {
      h2: "Option 2: Hiring it out",
      body: "Paying a **freelancer or agency** gets you a site without doing the work yourself. Done well, it can produce genuinely polished results.\n\nThe trade-offs are real, though. Cost is higher, and turnaround is often **weeks, not days**.\n\nThere's also dependency: if you need a small change later, you may be waiting on someone else's schedule again.\n\nThis route makes the most sense when your needs are complex or highly custom — or when your time is worth more spent on the business than on the website. For a straightforward local service business, it's often **more than the job actually requires**.",
    },
    {
      h2: "Option 3: AI website generators",
      body: "The newer option: describe your business in a sentence or two. An **AI generator** builds a working site — pages, copy, structure — in minutes instead of days.\n\nYou're not starting from a blank template. You're starting from something close to done, and editing from there.\n\nThe honest trade-off is customization depth. For a highly specific design vision, a generator won't match a **skilled designer working from scratch**.\n\nBut most local service businesses need a clean, fast, correct site — not a bespoke one. For that job, a generator closes the gap between \"I need a website\" and \"I have one\" **faster than either of the other two options**.\n\nOur own [AI website generator](/tools/ai-website-generator) works this way — free to try, no design skill required.",
      callout: {
        kind: "analogy",
        text: "An AI generator is like ordering a suit off the rack that's already been tailored to your measurements — you're not sewing from a bolt of cloth, and you're not paying full bespoke prices either.",
      },
      diagram: {
        type: "flow",
        title: "From a sentence to a working site",
        steps: [
          { label: "Describe your business", sub: "one or two sentences" },
          { label: "AI builds the site", sub: "pages, copy, structure" },
          { label: "Edit from there", sub: "minutes, not days" },
        ],
      },
    },
    {
      h2: "What every service-business site needs, no matter how you build it",
      body: "Here's the part that matters more than which method you pick: **the site itself needs to do certain jobs**, and it needs to do them regardless of who or what built it.\n\nA visitor should find a **click-to-call number** and a way to **book online** within a few seconds of landing. A short lead form catches people who'd rather type than call.\n\nThe page has to load fast on mobile — most visitors are on a phone. It should use **clear language about your city and your services**, not vague marketing copy a search engine — or a person — can't map to what you actually do.\n\nTwo more matter behind the scenes: *LocalBusiness schema* (structured data that tells search engines exactly who you are and where) and **visible reviews** on the page itself, not just linked off to another site.\n\nMiss any of these and the site can still look fine — it just quietly loses you jobs. Our [website losing you jobs checklist](/guides/is-your-website-losing-you-jobs) walks through each one in more depth.",
      callout: {
        kind: "analogy",
        text: "LocalBusiness schema is like a business card printed in a language search engines read directly, instead of them guessing your city and services from paragraphs of homepage copy.",
      },
      diagram: {
        type: "stack",
        title: "The 7 things a service-business site needs",
        layers: [
          { label: "Click-to-call number", sub: "answer in one tap" },
          { label: "Online booking", sub: "book without calling" },
          { label: "Short lead form", sub: "for people who'd rather type" },
          { label: "Fast mobile loading", sub: "most visitors are on a phone" },
          { label: "Clear local language", sub: "your city, your services, plainly stated" },
          { label: "LocalBusiness schema", sub: "structured data search engines can read" },
          { label: "Visible reviews", sub: "on the page itself" },
        ],
      },
    },
  ],
  faq: [
    {
      q: "What does a service business website actually need?",
      a: "The same 7 things regardless of how you build it: a click-to-call number, a way to book online, a short lead form, fast mobile loading, clear language about your city and services, LocalBusiness schema, and visible reviews. Our [website losing you jobs checklist](/guides/is-your-website-losing-you-jobs) walks through each one.",
    },
    {
      q: "Is a free website generator actually free, or is there a catch?",
      a: "It depends on the tool — read what you're agreeing to. Ours generates a real working site **free with no upfront card required**; you'd only pay if you later want **gated features** like a custom domain or a second workspace. Always check what happens after the free part before you commit content and time to a platform.",
    },
    {
      q: "How fast can I really get a website live?",
      a: "With an AI generator, a working first draft in **minutes** is realistic — you're editing, not building from zero. A DIY builder is more often **a few hours to a couple of days** once you factor in the learning curve. Hiring out is usually measured in **weeks**.",
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
  ],
};
