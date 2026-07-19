import type { Guide } from "./types";

export const guide: Guide = {
  slug: "why-leads-go-cold",
  title: "Why Do Leads Go Cold? (And How to Keep Them Warm)",
  description:
    "Leads go cold when they book someone else or lose urgency — usually because you were slow to respond. Here's what \"cold\" really means, the top causes, and how to stay warm.",
  targetKeyword: "why do leads go cold",
  intent: "informational",
  cluster: "speed-to-lead",
  relatedTool: "/tools/speed-to-lead-calculator",
  relatedBest: "/ai-agents/ai-receptionist",
  dek: "A lead going \"cold\" rarely means they stopped needing what you sell. It usually means someone else got to them first, or the moment of urgency passed while they waited on you. The good news: the same handful of gaps cause almost all of it, and they're fixable.",
  sections: [
    {
      h2: "What \"going cold\" really means",
      body: "A **cold lead** is someone who was ready to move — and now isn't. They didn't change their mind about the problem. The window just closed.\n\nThat happens one of two ways.\n\nThe first: they booked someone else. Most people contacting a local business are contacting more than one. By the time you follow up, a competitor already answered, quoted, and locked in the slot. The lead isn't \"unresponsive.\" They're just gone.\n\nThe second: the urgency drained away. Someone fills out a form at 9pm, feeling motivated. No reply comes. By the next afternoon the burst pipe got patched, the itch to renovate faded, or life just moved on.\n\nThe need didn't disappear. The moment you could have caught it did. **\"Cold\" is the symptom — a missed window is the cause.**",
      callout: {
        kind: "analogy",
        text: "A lead going cold is a lit match burning down — there's a short window where it can light something, and then it's just a spent stick no matter how much you want it back.",
      },
    },
    {
      h2: "The top causes of cold leads",
      body: "Almost every cold lead traces back to one of four gaps. **Slow first response is the biggest by far.**\n\nA new lead is comparing options in real time. The classic Harvard Business Review study of thousands of US companies found the odds of a meaningful conversation dropped sharply the longer firms waited to reach out. Answer in minutes and you're in the running. Answer tomorrow, and you're often talking to someone who already booked.\n\nThe second gap: no follow-up cadence. Plenty of leads don't reply to the first touch — they're busy, distracted, or still deciding. One unanswered message gets written off as dead, when a second or third polite nudge would have reopened the conversation.\n\nThe third: dropped after-hours and mid-job leads. Calls that come in while you're on a ladder, driving, or asleep go to voicemail and never get a callback. For a lot of small businesses, that's where most cold leads are actually created.\n\nThe fourth: **friction to book**. Even an interested lead cools off if turning interest into an appointment means phone tag, a vague \"sometime tomorrow,\" or a form asking for too much. Every extra step is another chance to give up or go elsewhere.",
      diagram: {
        type: "flow",
        title: "The four gaps, in order of how often they cause a cold lead",
        steps: [
          { label: "Slow first response" },
          { label: "No follow-up cadence" },
          { label: "After-hours / mid-job drop" },
          { label: "Friction to book" },
        ],
      },
    },
    {
      h2: "How to keep leads warm",
      body: "Keeping a lead warm mostly means closing those same four gaps, in order.\n\nStart with an **instant first touch**. Getting a real, human-sounding response back in minutes — while they're still on your site or still holding their phone — is the single highest-leverage thing you can do. It plants your flag before a competitor answers. This isn't a \"we got your message\" autoresponder. It's an actual reply that answers the question or offers a time.\n\nThen build a persistent but polite **follow-up cadence**. Don't judge a lead on one message. A short sequence — a reply, then a check-in a day later, then one more — recovers a meaningful share of leads that would otherwise get marked dead, without tipping into nagging.\n\nFinally, **make booking effortless**. The warmest thing you can do with an interested lead is let them grab a time on the spot: a live link, a same-visit offer, a booking they confirm in one step. Cut the round-trips and you cut the cooling-off windows where leads slip away.\n\nWant a rough sense of what your own gaps are costing? Our [speed-to-lead calculator](/tools/speed-to-lead-calculator) turns your numbers into a dollar figure. And if you want the deeper mechanics of that first gap, see [what speed to lead actually means](/guides/what-is-speed-to-lead).",
    },
    {
      h2: "Where automation prevents cold leads",
      body: "The hard part of keeping leads warm isn't knowing what to do. It's being available the exact moment each lead arrives — which for a small team is impossible by hand.\n\nYou can't answer in five minutes when you're under a sink. You can't run a three-touch follow-up on every lead while also doing the actual work.\n\nThat's the gap automation is built for. An **AI receptionist** answers instantly, around the clock — on the phone, website chat, or text — so the after-hours and on-a-job leads that used to go cold get caught, qualified, and booked while the urgency is still there.\n\nIt runs the polite follow-up cadence you'd never have time for, and hands you an already-captured, already-warm contact instead of a voicemail you'll return too late.\n\nThe point isn't to replace the human touch. It's to make sure a lead never sits in silence long enough to go cold in the first place.",
      callout: {
        kind: "tip",
        text: "If the after-hours gap is your biggest source of cold leads, start there — it's usually the single largest bucket, and the fix (something answers every time, day or night) doesn't require rebuilding how you handle the leads you already catch.",
      },
    },
  ],
  faq: [
    {
      q: "Why do leads go cold so fast?",
      a: "Because most leads are contacting several businesses at once and acting on a moment of urgency. If you don't respond while that moment is live, a competitor answers first or the need gets handled another way. The Harvard Business Review research found the chance of a real conversation falls sharply the longer you wait to make contact.",
    },
    {
      q: "How do you warm up a cold lead?",
      a: "Reach back out with a short, genuinely helpful message rather than a generic \"just checking in.\" A polite follow-up cadence — a reply, a day-later nudge, then one more — recovers a real share of leads that looked dead. But warming a cold lead is always harder than never letting it cool, so the bigger win is responding fast the first time.",
    },
    {
      q: "What's the main reason leads go cold for small businesses?",
      a: "Usually the after-hours and mid-job gap: the calls and forms that land when no one's free to answer, then never get a timely callback. Those are the leads most likely to book with whoever responds first, which is why instant response tends to matter even more for small local teams.",
    },
  ],
  sources: [
    {
      label: "Harvard Business Review — “The Short Life of Online Sales Leads” (Oldroyd, McElheran, Elkington)",
      url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads",
    },
  ],
};
