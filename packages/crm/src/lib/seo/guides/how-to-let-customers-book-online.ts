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
  dek: "Letting customers book online means giving them a way to see your open times and reserve one themselves — no phone call, no text thread, no waiting for you to reply. Here's what that actually takes for a small local business, and where a phone call still wins.",
  sections: [
    {
      h2: "What \"book online\" really means",
      body: "At its simplest, online booking is a page or button. It shows a customer your real availability. They pick a slot and claim it themselves.\n\nThe moment they confirm, the appointment lands on your calendar. Both of you get a confirmation right away — **no back-and-forth**, no \"let me check and get back to you.\"\n\nThat last part is the whole point. Most missed bookings aren't lost because someone decided against you — they're lost in the gap between \"I'd like to book\" and \"I finally got hold of them.\"\n\nA booking page **closes that gap**. The customer can finish the moment they're motivated, including at 9pm on a Sunday when your phone is off.",
      diagram: {
        type: "flow",
        title: "What happens when a customer books online",
        steps: [
          { label: "Sees your open times" },
          { label: "Picks a slot", sub: "claims it themselves" },
          { label: "Lands on your calendar" },
          { label: "Both get confirmed", sub: "no back-and-forth" },
        ],
      },
    },
    {
      h2: "The pieces you actually need",
      body: "You need four things, and none of them require rebuilding your website.\n\nFirst, a list of the services you offer and roughly how long each takes, so the calendar can block the right amount of time. Second, your real working hours and any **buffers between jobs**.\n\nThird, a booking tool that turns those into visible time slots. Fourth, somewhere to send the customer — a link you can text, a button on your site, or a spot in your Google Business Profile.\n\nKeep the first version deliberately small: one or two services, a single calendar, and the fewest questions you can get away with. You can always [add online booking to your website](/guides/how-to-add-online-booking-to-your-website) in stages.\n\nThe common mistake is launching with a form so long that people give up before they finish.",
      callout: {
        kind: "analogy",
        text: "A buffer between jobs is the yellow light between green and red on your calendar — not enough gap to look empty, but exactly enough to keep a job that's running long from crashing into the next one.",
      },
    },
    {
      h2: "Map your real availability first",
      body: "The unglamorous part that decides whether online booking helps or hurts is getting your **availability honest**.\n\nIf the page offers times you can't actually make — because you're mid-job, driving, or already double-booked elsewhere — you trade phone tag for a worse problem: confirmed appointments you have to cancel.\n\nBefore you publish anything, decide what a bookable slot really looks like: how long each job takes, how much travel or cleanup sits around it, and how far in advance you need notice.\n\nA booking tool that **syncs to the calendar you already live in** keeps that from drifting out of date. That way, an open slot online always means an open slot in real life.",
    },
    {
      h2: "Where online booking fits, and where a call still wins",
      body: "Online booking is a strong default for routine, well-defined jobs — a haircut, a cleaning, a standard service call, a consultation. The customer already knows what they want, so the fastest path is letting them grab a time.\n\nFor anything vague, high-stakes, or that needs a quote first, a short conversation still beats a form. It's fine to offer both — see [online booking vs. phone booking](/guides/online-booking-vs-phone-booking) for where each one wins.\n\nThe honest goal isn't to remove the phone. It's to stop losing the people who would rather not use it.\n\nIn a Phreesia survey of nearly 14,000 patients, roughly 18% said they preferred to book online while about 65% still preferred the phone. So think of online booking as **capturing a real and growing slice** you're otherwise missing, not as replacing everyone.\n\nIf you're not sure how much friction sits between an interested customer and a confirmed booking, our [booking friction grader](/tools/booking-friction-grader) walks your current flow and points at the specific steps where people are most likely to drop off.",
      callout: {
        kind: "analogy",
        text: "Booking friction is the sand in the gears between someone wanting an appointment and actually getting one — one extra form field, one login wall, one confusing button, and they quietly leave instead of pushing through.",
      },
      diagram: {
        type: "bars",
        title: "Preferred way to book, from a Phreesia survey of ~14,000 patients",
        unit: "%",
        items: [
          { label: "Prefer booking online", value: 18, display: "roughly 18%" },
          { label: "Still prefer the phone", value: 65, display: "about 65%" },
        ],
        note: "Phreesia survey — online booking captures a real, growing slice; it doesn't replace the phone.",
      },
    },
  ],
  faq: [
    {
      q: "Do I need a website to let customers book online?",
      a: "No. A booking tool gives you a **shareable link** that works on its own — you can text it, put it in your email signature, add it to your Google Business Profile, or link it from social media. A website just gives you one more place to put the button.",
    },
    {
      q: "Will online booking make my business feel less personal?",
      a: "It doesn't have to. Online booking handles the scheduling logistics so your actual time with the customer stays personal. Many businesses keep a phone number visible for anyone who prefers to call, and use online booking to catch the people who would otherwise never pick up the phone.",
    },
    {
      q: "What's the most common mistake when setting this up?",
      a: "Asking for **too much upfront**. Long forms, mandatory account creation, and payment before the customer has committed are the usual reasons people abandon a booking. Start with the fewest fields you truly need, and add more only if you find you're missing something.",
    },
  ],
  sources: [
    {
      label: "Phreesia — “Understanding Patients’ Preferences and Habits” (survey of ~14,000 patients on appointment scheduling)",
      url: "https://www.phreesia.com/insights/whitepaper-understanding-patient-preferences-habits/",
    },
  ],
};
