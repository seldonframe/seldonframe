import type { Guide } from "./types";

export const guide: Guide = {
  slug: "text-or-call-a-new-lead",
  title: "Should You Text or Call a New Lead? (A Practical Answer)",
  description:
    "Texting gets faster, easier engagement; calling signals urgency and intent. Here's how to decide — match the channel they used, text first, then call — plus the consent rule.",
  targetKeyword: "should you text or call a new lead",
  intent: "informational",
  cluster: "speed-to-lead",
  relatedTool: "/tools/speed-to-lead-calculator",
  relatedBest: "/ai-agents/ai-receptionist",
  dek: "When a new lead comes in, the question isn't just how fast you respond — it's how. Texting and calling both win, but they win in different situations. Here's a practical way to decide, without pretending one channel beats the other everywhere.",
  sections: [
    {
      h2: "The case for texting",
      body: "Texting has one big thing going for it: **almost no friction**. A text doesn't ask someone to stop what they're doing, find a quiet spot, and talk to a stranger. They can glance at it between tasks and reply in ten seconds.\n\nThat's why so many new leads answer a text when they'd let a call go to voicemail.\n\nThe research points the same direction, even when the exact numbers vary. Marketing vendors often report that texts get opened far more than emails, usually within minutes. People also tend to reply to texts more easily than to calls from a number they don't know.\n\nTreat the specific percentages you see online with some caution. Many come from companies that sell texting software, so the numbers tend to run high. But the pattern itself — texts get **seen fast and answered easily** — shows up everywhere it's measured.\n\nFor a small local business, that low friction is the whole point. A lead who filled out a form at 9 p.m., or texted from a job site, isn't ready for a phone conversation. But they'll happily fire back \"yes, tomorrow morning works.\"\n\nTexting lets you **keep that thread alive** instead of playing phone tag.",
    },
    {
      h2: "The case for calling",
      body: "A phone call carries something a text can't: presence. You can hear urgency in someone's voice, answer three questions at once, and **handle an objection right there**. For a big or urgent job, a call can lock in an appointment before the person moves on to the next business on their list.\n\nFor higher-intent or higher-dollar work — a burst pipe, a roof leak, an estimate someone is actively shopping — a call often does in ninety seconds what a text thread stretches over an afternoon.\n\nCalling also filters for intent. Someone who picks up and talks is usually further along than someone tapping out a one-word reply. **For urgent or big-ticket jobs, the call tends to move faster toward a booked job.**\n\nWorth remembering: surveys don't show a universal preference for either channel. Pew Research has found that a majority of U.S. cell owners say they'd rather be reached by a voice call, while heavy texters lean the other way.\n\nSo the **\"right\" channel depends on who the lead is** — not just on what's trendy.",
      diagram: {
        type: "compare",
        title: "Text vs. call, at a glance",
        left: {
          heading: "Text",
          items: [
            "Almost no friction — replies in seconds",
            "Best when the lead already texted or filled a form",
            "Wins on speed and ease",
          ],
        },
        right: {
          heading: "Call",
          items: [
            "Real presence — handles objections live",
            "Best for urgent, high-dollar jobs",
            "Wins on intake and closing fast",
          ],
        },
      },
    },
    {
      h2: "A practical rule of thumb",
      body: "The cleanest rule is also the most obvious one: **match the channel they used**. If someone called you, call them back — they've told you they're comfortable on the phone.\n\nIf they texted or filled out a web form, start with a text. That's the door they chose to knock on.\n\nWhen you're not sure, **text first, then call**. A quick text lands with almost no friction, gets seen fast, and lets the lead reply on their own terms.\n\nIf they reply, you're in a conversation. If it's urgent and they go quiet for a few minutes, follow up with a call while the job is still fresh in their mind. You lose nothing by leading with the low-friction channel and escalating to the high-intent one.\n\nWhichever way you go, **speed matters more than channel**. A text in two minutes beats a perfect phone call in two hours — by then the lead may have already booked with whoever answered first.\n\nThis gap — how fast you respond to a new lead — is sometimes called *speed to lead*. If you want to see what slow responses are quietly costing you, the [speed-to-lead calculator](/tools/speed-to-lead-calculator) puts a rough dollar figure on the gap between a fast and a slow response, using your own numbers. For the deeper mechanics, see [why leads go cold](/guides/why-leads-go-cold).",
      callout: {
        kind: "tip",
        text: "Set a timer. If an urgent lead hasn't replied to your text in 5-10 minutes, that's your cue to call — don't wait longer just because the text already went out.",
      },
      diagram: {
        type: "flow",
        title: "The text-first, then-call rule",
        steps: [
          { label: "Text first", sub: "low friction, fast reply" },
          { label: "They reply", sub: "you're in a conversation" },
          { label: "No reply + urgent", sub: "job still fresh in their mind" },
          { label: "Call to close" },
        ],
      },
    },
    {
      h2: "A quick note on consent and compliance",
      body: "There's a catch with leading on text: business texting in the U.S. isn't a free-for-all. Sending marketing or automated messages to people who haven't agreed to hear from you can put you on the wrong side of consumer-protection rules.\n\nCarriers now require most businesses to register the numbers and campaigns they use to text customers. The process is usually called *A2P 10DLC registration*.\n\nThe honest short version: get **clear consent** before you text a lead — a form checkbox or a prior call where they say \"yes, text me\" both work. Keep your messages relevant to what they asked about.\n\nMake sure the number you send from is **properly registered**, so your texts actually get delivered instead of silently filtered. If you're not sure whether your setup is compliant, the [A2P 10DLC checker](/tools/a2p-10dlc-checker) walks through what registration you need.\n\nNone of this is a reason to avoid texting. **It's just the paperwork that keeps texting working for you** instead of against you.",
      callout: {
        kind: "analogy",
        text: "A2P 10DLC registration is the carriers' ID check for business texting — like showing ID to open a business bank account. Skip it, and the carriers treat your messages as suspicious traffic and quietly filter them out.",
      },
    },
  ],
  faq: [
    {
      q: "Is it better to text or call a new lead?",
      a: "Neither wins everywhere. The most reliable rule is to **match the channel the lead used** — call back callers, text back texters and form fills. When in doubt, text first (low friction, seen quickly) and follow up with a call if it's urgent and they go quiet. Speed matters more than the channel you pick.",
    },
    {
      q: "How fast should I respond to a new lead?",
      a: "As close to immediately as you can. Vendor and industry studies consistently find that response within about five minutes dramatically raises your odds of connecting and converting, because the lead is still engaged and hasn't yet contacted a competitor. A text in two minutes usually beats a call in two hours.",
    },
    {
      q: "Do I need permission to text a business lead?",
      a: "For business texting in the U.S., you generally need the person's consent and, in most cases, a properly registered number (A2P 10DLC). Get a **clear opt-in** — a form checkbox or a prior call where they agree to be texted — keep messages relevant, and make sure your sending number is registered so texts get delivered.",
    },
  ],
  sources: [
    {
      label:
        "InsideSales — “Response Time Matters” (2021 Lead Response Study, 55M+ sales activities): conversion rates are ~8x greater in the first five minutes",
      url: "https://www.insidesales.com/response-time-matters/",
    },
    {
      label:
        "Pew Research Center — “How Americans Use Text Messaging”: a majority of cell owners say they prefer a voice call, while heavy texters prefer text",
      url: "https://www.pewresearch.org/internet/2011/09/19/how-americans-use-text-messaging/",
    },
  ],
};
