import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-write-an-ai-receptionist-script",
  title: "How to Write an AI Receptionist Script (Template + Examples)",
  description:
    "A practical, plain-English guide to writing an AI receptionist script that greets callers, qualifies the job, books the appointment, and never sounds robotic.",
  targetKeyword: "ai receptionist script",
  intent: "informational",
  cluster: "ai-receptionist",
  relatedTool: "/tools/ai-receptionist-script-generator",
  relatedBest: "/ai-agents/ai-receptionist",
  dek: "An AI receptionist is only as good as the script behind it. This is a step-by-step walkthrough of what to put in that script — the greeting, the questions, the objection handling, and the handoff — written for a small local service business, not a call center.",
  sections: [
    {
      h2: "What an AI receptionist script actually is",
      body: "A script here doesn't mean a rigid word-for-word monologue the AI reads back like a telemarketer. It means the instructions and structure you give the AI: how to greet people, what it needs to find out, what it's allowed to say, when to book, and when to take a message or escalate to a human.\n\nThe goal is a caller who hangs up feeling like they talked to a competent person at your business, and a you who wakes up to a booked job with the address, the problem, and the callback number already captured. A good script is mostly about the questions you ask and the boundaries you set, not clever phrasing.",
    },
    {
      h2: "Start with the greeting and identity",
      body: "Open the way a good human receptionist would. Receptionist trainers commonly recommend a greeting that combines a courteous opening, your business name, and an offer to help — something like \"Thanks for calling Ace Plumbing, this is the front desk, how can I help you today?\" Ruby, a live virtual-receptionist company, teaches essentially this three-part structure.\n\nDecide up front how the AI should identify itself. Many small businesses are comfortable with a warm, neutral assistant that simply answers as \"the front desk\" or by a first name; what matters most is that you're honest if a caller directly asks whether they're speaking to a person. Being caught pretending to be human erodes trust far more than politely confirming it's an assistant that can still book them in.",
    },
    {
      h2: "Write the questions that qualify and book the job",
      body: "This is the part that earns its keep. List the handful of things you need from every caller before you'd ever roll a truck or block off time: what's going on (the problem), where (address or service area), how urgent, and how to reach them (name and number). Put these in the order a natural conversation would take them, and have the AI ask one at a time.\n\nThen give it the booking rules: your real availability, your service area, the jobs you do and don't take, and any minimum charge or trip fee you want disclosed before booking. The more of your actual policies you encode, the fewer bad-fit appointments you get. If a caller falls outside the rules — out of area, a job you don't do — the script should say so kindly and offer to take a message rather than book a job you'll have to cancel.",
    },
    {
      h2: "Handle the awkward moments and the handoff",
      body: "Real calls go sideways: a frustrated customer, a price question you don't want quoted over the phone, an emergency, someone who insists on talking to the owner. Your script should have a plain answer for each. For pricing, it's usually safer to explain how you price and offer to book a quote than to invent a number. For emergencies or angry callers, empathize briefly and route to a human or take an urgent message with a promised callback window.\n\nFinally, define the handoff. What counts as \"booked\"? Where does the appointment and the caller's details land — a text to you, a calendar invite, a CRM entry? An AI receptionist that books a job but doesn't reliably tell you about it is worse than voicemail. If you'd rather not draft all of this from scratch, our AI receptionist script generator turns a few answers about your business into a working first draft you can edit.",
    },
    {
      h2: "Test it like a real caller before you trust it",
      body: "Before it answers a live customer, call your own script the way your worst-case customer would. Mumble the address. Ask for a price. Try to book a job you don't do. Say \"is this a robot?\" Listen for anywhere it stalls, over-promises, or makes something up, and tighten those spots.\n\nKeep the first version narrow and honest rather than broad and impressive. A script that reliably books straightforward jobs and cleanly takes a message for everything else will beat a clever one that occasionally invents a price or an appointment slot. You can always widen what it handles once you trust what it already does.",
    },
  ],
  faq: [
    {
      q: "How long should an AI receptionist script be?",
      a: "Long enough to cover your greeting, your qualifying questions, your booking rules, and a handful of common objections — but no longer. Most small service businesses can capture what they need in a page or two of plain instructions. The depth belongs in your policies and questions, not in scripted small talk.",
    },
    {
      q: "Should the AI tell callers it's not a human?",
      a: "You don't necessarily need to announce it in the greeting, but the script should never deny it if a caller asks directly. A simple, honest \"I'm an assistant for the business, but I can go ahead and book that for you\" keeps trust intact. Getting caught pretending to be a person is far more damaging than being upfront.",
    },
    {
      q: "What's the most common mistake in receptionist scripts?",
      a: "Focusing on the wording of the greeting and neglecting the qualifying questions and the handoff. The greeting sets the tone, but the questions determine whether you get a bookable job with usable details, and the handoff determines whether you ever find out about it.",
    },
  ],
  sources: [
    {
      label: "Ruby — “How to Answer a Call” (professional greeting structure and answer speed)",
      url: "https://www.ruby.com/blog/how-to-answer-a-call/",
    },
  ],
};
