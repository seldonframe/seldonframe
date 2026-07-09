import type { Guide } from "./types";

export const guide: Guide = {
  slug: "online-booking-options-for-service-businesses",
  title: "How to Let Customers Book Appointments Online (Without Paying for Another Tool)",
  description:
    "A comparison of ways to let customers book online — Calendly-style links, industry FSM suites, built into your site — plus what a good booking page needs, and the free path.",
  targetKeyword: "how to get customers to book online",
  intent: "informational",
  cluster: "booking",
  relatedTool: "/tools/free-booking-page",
  relatedBest: "/best/booking-system-for-small-business",
  dek: "Call-only scheduling loses the customer who decides to book at 9pm. This is a plain comparison of the ways to let people book online — generic scheduling links, industry-specific suites, and booking built into your own site — plus what a good booking page actually needs, and how to get one without adding another monthly bill.",
  sections: [
    {
      h2: "Why call-only quietly loses bookings",
      body: "A phone only works when someone is there to answer it. Every hour you're closed, on a job, or already on another call is an hour a would-be customer either has to wait or has to try someone else. Phreesia's survey of patient scheduling preferences found people split — roughly two-thirds still prefer calling, but a real and growing share, about 18%, prefer to book online — meaning a call-only setup isn't losing everyone, but it is losing a specific, recoverable slice.\n\nThe after-hours gap is the biggest part of that slice. Someone who decides to book at 9pm on a Sunday either waits until Monday (and may call a competitor in the meantime) or gives up. Online booking doesn't need to replace your phone; it just needs to catch the people who'd rather not use it, whenever they show up.",
    },
    {
      h2: "The options, compared honestly",
      body: "There are three broad ways to let people book online. The first is a generic scheduling link (the Calendly-style tool): fast to set up, works for almost any business, but usually needs manual setup for services, buffers, and reminders, and doesn't know anything about your trade.\n\nThe second is an industry-specific field service or scheduling suite, built for trades like HVAC, cleaning, or landscaping. These often bundle dispatch, invoicing, and routing on top of booking — powerful if you need that depth, but usually a bigger monthly cost and a steeper setup than a business that just needs a booking page actually requires.\n\nThe third is booking built directly into your own site or CRM, alongside your contacts and calendar rather than in a separate app. The advantage is one less tool to pay for and manage, and one less place your customer data lives. Which of the three fits depends mostly on whether you already have (or want) a CRM handling everything else — if you do, booking that lives inside it is usually the lowest-friction, lowest-cost path.",
    },
    {
      h2: "What a good booking page actually needs",
      body: "Whichever option you pick, a booking page earns its keep on a few unglamorous details. Buffer time between appointments matters so a job that runs long doesn't collide with the next one — without it, your calendar looks open when it isn't. Automatic confirmations and reminders matter because they're one of the more dependable ways to cut no-shows; the exact improvement varies by business, but a timely reminder reliably beats no reminder at all. If missed appointments are already a real cost for you, our no-show cost calculator puts a rough number on what they're worth fixing.\n\nA short set of intake questions — what the job is, the address, anything you need to know before you show up — turns a bare time slot into something you can actually prepare for. Keep it to the essentials: a long form at the booking stage is one of the most common reasons people abandon before finishing. If you want to see how much friction your current setup adds, run it through our booking friction grader. And if you're weighing whether online booking is worth adding at all, our benefits of online booking guide covers the case for it in more depth; if you've already decided and just want the practical setup steps, see how to let customers book online.",
    },
  ],
  faq: [
    {
      q: "Do I need a separate booking tool if I already have a website or CRM?",
      a: "Often not. If your CRM or site can host a booking page directly, that avoids paying for and syncing a separate scheduling app. It's worth checking before you sign up for another monthly tool — a free booking page built into what you already use covers most small service businesses' needs.",
    },
    {
      q: "What does a good booking page actually need?",
      a: "At minimum: buffer time between appointments so back-to-back jobs don't collide, automatic confirmations and reminders so people actually show up, and a short set of intake questions so you know what the job is before you arrive. Extra fields beyond that mostly just cause people to abandon the form.",
    },
    {
      q: "Is a free online booking page really free, or is there a catch?",
      a: "Read the specifics of whatever tool you pick — some free tiers cap the number of bookings or hide reminders behind a paid plan. Our free booking page includes buffers, reminders, and intake questions with no upfront card required; you'd only pay later for gated features like a custom domain.",
    },
  ],
  sources: [
    {
      label: "Phreesia — \"Understanding Patients' Preferences and Habits\" (survey of ~14,000 patients on appointment scheduling)",
      url: "https://www.phreesia.com/insights/whitepaper-understanding-patient-preferences-habits/",
    },
  ],
};
