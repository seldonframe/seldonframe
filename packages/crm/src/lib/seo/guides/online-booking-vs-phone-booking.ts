import type { Guide } from "./types";

export const guide: Guide = {
  slug: "online-booking-vs-phone-booking",
  title: "Online Booking vs Phone Booking: Which Is Better for Your Business?",
  description:
    "An honest comparison of online booking vs phone booking for small service businesses — where each one wins, what surveys actually show, and why most need both.",
  targetKeyword: "online booking vs phone booking",
  intent: "informational",
  cluster: "booking",
  relatedTool: "/tools/booking-friction-grader",
  relatedBest: "/best/booking-system-for-small-business",
  dek: "Online booking is often pitched as the obvious winner. The honest answer is more interesting: phone booking still wins for a lot of customers and a lot of jobs. Here's what the surveys actually show and how to decide what fits your business.",
  sections: [
    {
      h2: "What the surveys actually show",
      body: "It's tempting to assume everyone wants to book online now, but the data doesn't say that. In a March 2025 YouGov survey, phone was still the single most preferred way for Americans to contact a business (about 35%), and the preference skewed sharply by age — roughly 52% of Baby Boomers favored calling, versus a minority of younger consumers. In Phreesia's survey of patients, about 65% still preferred to schedule by phone against roughly 18% who preferred online.\n\nSo the real picture is a split, not a winner. A meaningful and growing share of people prefer to book online, and another large share — often older, or dealing with something they want to talk through — still reach for the phone. Any honest comparison starts by admitting both groups are real and neither is going away soon.",
    },
    {
      h2: "Where phone booking still wins",
      body: "Phone booking earns its keep whenever the job isn't simple or the customer needs reassurance. For a complex quote, a diagnosis, an urgent problem, or an expensive decision, a two-minute conversation does what no form can: it answers questions, builds trust, and lets you tailor the offer. It's also where you catch nuance a form would miss and where upsells and clarifications naturally happen.\n\nAnd for a large slice of customers, the phone simply is their preference — the survey numbers above make that plain. Push those people into an online-only flow and some of them won't book at all. For businesses whose customers skew older, or whose work is high-stakes and consultative, phone booking isn't a legacy habit to eliminate; it's a channel that's genuinely converting.",
    },
    {
      h2: "Where online booking wins",
      body: "Online booking wins on the things phones are bad at: availability, speed, and self-service. It works at 11pm and during the customer's own workday, it never puts anyone on hold, and it lets a decided customer grab a routine slot in under a minute without the phone-tag loop. For haircuts, cleanings, standard service calls, and repeat appointments, that's often the faster and more pleasant path for everyone.\n\nIt also quietly captures demand you'd otherwise lose. Every booking attempt that arrives while you're on a job or asleep is one a phone-only business misses. Online booking is how you catch the customer who was ready to commit at a moment you couldn't possibly have answered.",
    },
    {
      h2: "The answer is usually both",
      body: "For most small service businesses, framing it as online versus phone is the wrong question. The two channels serve different customers and different jobs, and offering both lets each person use whatever they're comfortable with — which almost always books more total appointments than forcing everyone down one path.\n\nThe practical move is to keep your phone number visible and easy, and add online booking to catch the people who'd rather not call. Then make the online path genuinely smooth, because a bad booking page can lose the exact customers it was meant to win. The booking friction grader checks your online flow for the snags — extra fields, hidden costs, mobile problems — that make people give up and reach for the phone instead, or worse, leave.",
    },
  ],
  faq: [
    {
      q: "Should I get rid of my phone number if I add online booking?",
      a: "No. Surveys consistently show phone is still the preferred contact method for a large share of customers, especially older ones and those with complex needs. Removing the phone would cost you those bookings. Add online booking alongside the phone rather than instead of it.",
    },
    {
      q: "Which do customers actually prefer?",
      a: "It's split and depends heavily on age and job type. Recent surveys show phone remains the most preferred contact method overall, while a substantial and growing minority prefer to book online — younger customers and routine appointments skew online, older customers and complex jobs skew phone.",
    },
    {
      q: "Do I really need both online and phone booking?",
      a: "For most small service businesses, yes. Each channel wins with a different group of customers, so offering both captures more total bookings than either alone. The phone handles conversations and reassurance; online booking handles after-hours and self-service.",
    },
  ],
  sources: [
    {
      label: "YouGov — “How Americans prefer to contact businesses for customer service” (March 2025; phone ~35% overall, ~52% of Baby Boomers)",
      url: "https://yougov.com/en-us/articles/51802-how-americans-prefer-to-contact-businesses-for-customer-service",
    },
    {
      label: "Phreesia — “Understanding Patients’ Preferences and Habits” (~65% preferred phone scheduling vs ~18% online)",
      url: "https://www.phreesia.com/insights/whitepaper-understanding-patient-preferences-habits/",
    },
  ],
};
