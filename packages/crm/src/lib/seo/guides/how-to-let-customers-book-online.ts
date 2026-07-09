import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-let-customers-book-online",
  title: "How to Let Customers Book Appointments Online (A Practical Guide)",
  description:
    "A plain-English guide for small service businesses on letting customers book appointments online — the pieces you need, the setup, and where a call still wins.",
  targetKeyword: "how to let customers book appointments online",
  intent: "informational",
  cluster: "booking",
  relatedTool: "/tools/booking-friction-grader",
  relatedBest: "/best/booking-system-for-small-business",
  dek: "Letting customers book online means giving them a way to see your open times and reserve one themselves — without a phone call, a text thread, or waiting for you to reply. Here's what that actually takes for a small local business, and where a phone call still does the job better.",
  sections: [
    {
      h2: "What \"book online\" really means",
      body: "At its simplest, online booking is a page or button that shows a customer your real availability and lets them claim a slot on their own. The moment they confirm, the appointment lands on your calendar and both of you get a confirmation — no back-and-forth, no \"let me check and get back to you.\"\n\nThat last part is the whole point. Most missed bookings aren't lost because someone decided against you; they're lost in the gap between \"I'd like to book\" and \"I finally got hold of them.\" A booking page closes that gap by letting the customer finish the moment they're motivated, including at 9pm on a Sunday when your phone is off.",
    },
    {
      h2: "The pieces you actually need",
      body: "You need four things, and none of them require rebuilding your website. First, a list of the services you offer and roughly how long each takes, so the calendar can block the right amount of time. Second, your real working hours and any buffers between jobs. Third, a booking tool that turns those into visible time slots. Fourth, somewhere to send the customer — a link you can text, a button on your site, or a spot in your Google Business Profile.\n\nKeep the first version deliberately small. One or two services, a single calendar, and the fewest questions you can get away with. You can always add options later; the common mistake is launching with a form so long that people give up before they finish.",
    },
    {
      h2: "Map your real availability first",
      body: "The unglamorous part that decides whether online booking helps or hurts is getting your availability honest. If the page offers times you can't actually make — because you're mid-job, driving, or already double-booked elsewhere — you trade phone tag for the worse problem of confirmed appointments you have to cancel.\n\nBefore you publish anything, decide what a bookable slot really looks like: how long each job takes, how much travel or cleanup sits around it, and how far in advance you need notice. A booking tool that syncs to the calendar you already live in keeps that from drifting out of date, so an open slot online always means an open slot in real life.",
    },
    {
      h2: "Where online booking fits, and where a call still wins",
      body: "Online booking is a strong default for routine, well-defined jobs: a haircut, a cleaning, a standard service call, a consultation. The customer knows what they want, and the fastest path is letting them grab a time. For anything vague, high-stakes, or that needs a quote first, a short conversation still beats a form — and it's fine to offer both.\n\nThe honest goal isn't to remove the phone; it's to stop losing the people who would rather not use it. In a Phreesia survey of nearly 14,000 patients, roughly 18% said they preferred to book online while about 65% still preferred the phone — so think of online booking as capturing a real and growing slice you're otherwise missing, not as replacing everyone. If you're not sure how much friction is standing between an interested customer and a confirmed booking, our booking friction grader walks your current flow and points at the specific steps where people are most likely to drop off.",
    },
  ],
  faq: [
    {
      q: "Do I need a website to let customers book online?",
      a: "No. A booking tool gives you a shareable link that works on its own — you can text it, put it in your email signature, add it to your Google Business Profile, or link it from social media. A website just gives you one more place to put the button.",
    },
    {
      q: "Will online booking make my business feel less personal?",
      a: "It doesn't have to. Online booking handles the scheduling logistics so your actual time with the customer stays personal. Many businesses keep a phone number visible for anyone who prefers to call, and use online booking to catch the people who would otherwise never pick up the phone.",
    },
    {
      q: "What's the most common mistake when setting this up?",
      a: "Asking for too much upfront. Long forms, mandatory account creation, and payment before the customer has committed are the usual reasons people abandon a booking. Start with the fewest fields you truly need and add more only if you find you're missing something.",
    },
  ],
  sources: [
    {
      label: "Phreesia — “Understanding Patients’ Preferences and Habits” (survey of ~14,000 patients on appointment scheduling)",
      url: "https://www.phreesia.com/insights/whitepaper-understanding-patient-preferences-habits/",
    },
  ],
};
