import type { Guide } from "./types";

export const guide: Guide = {
  slug: "missed-call-text-back",
  title: "Missed Call Text Back: What It Is and How to Set It Up",
  description:
    "A missed-call text-back automatically texts anyone whose call you didn't answer, so the conversation keeps going even when you're on a job or after hours. Here's how it works and how to set it up.",
  targetKeyword: "missed call text back",
  intent: "informational",
  cluster: "speed-to-lead",
  relatedTool: "/tools/missed-call-calculator",
  relatedBest: "/ai-agents/ai-receptionist",
  dek: "A missed call doesn't have to be a dead end. A missed-call text-back sends an automatic text the moment a call goes unanswered — turning a ring that nobody picked up into a conversation the caller can keep having.",
  sections: [
    {
      h2: "What a missed-call text-back actually does",
      body: "It's a simple trigger: someone calls, nobody answers in time, and instead of the call just ending, the caller immediately gets a text — usually something like \"Sorry we missed you! What can we help with?\" — from the same number they just dialed. The caller who might otherwise have hung up and moved to the next search result now has a way to keep talking, on a channel (text) they're more likely to actually check.\n\nIt's not a replacement for answering the phone. It's a safety net for the calls you genuinely can't take — mid-job, after hours, during a rush — so a missed call becomes a delayed conversation instead of a lost one.",
    },
    {
      h2: "Why text instead of voicemail",
      body: "Voicemail asks the caller to do more work: leave a message, wait for a callback, hope it comes before they've already called someone else. A text-back removes that wait — the caller sees a reply within seconds and can answer right there, on their own time, without having to explain their situation out loud to a recording.\n\nIt also fits how people already communicate about scheduling. Texting back and forth to nail down a time or answer a quick question is faster for both sides than a phone-tag loop.",
    },
    {
      h2: "How the timing compares to speed-to-lead",
      body: "The same principle behind our speed-to-lead research applies here: the well-known HBR analysis of lead response times found that businesses trying to reach a new lead within an hour had far better odds of a real conversation than those that waited — and the odds kept dropping the longer they waited. A missed-call text-back is that principle applied to phone calls specifically: instead of waiting for a human to notice a voicemail and call back, the follow-up happens in the same minute the call was missed.",
    },
    {
      h2: "How to set one up",
      body: "The lightest option, if you only need the caller to have a way to reach you by text, is Google's own Business Profile chat feature: add a phone number under your profile's Chat setting and customers can text that number directly (availability varies by region, and it currently supports one channel — text or WhatsApp — at a time, not both). This gets customers texting you; it doesn't automatically fire when a call is missed.\n\nFor an automatic reply the instant a call goes unanswered, you need a phone system or AI receptionist that's wired to trigger a text on a missed or unanswered call — most VoIP and call-tracking platforms support this as a rule, and an AI receptionist can go a step further and actually hold the conversation from there: answering questions, qualifying the caller, and booking the appointment over text instead of just sending one canned line.",
    },
  ],
  faq: [
    {
      q: "Does missed-call text-back work automatically or do I have to text back manually?",
      a: "The point of the feature is automation — it fires the moment a call goes unanswered, with no one needing to notice the missed call first. Manually texting back later still helps, but it loses the speed advantage that makes this effective.",
    },
    {
      q: "Is this the same as Google Business Profile messaging?",
      a: "No. Google's Business Profile chat feature lets customers text a number you list on your profile — useful, but it's caller-initiated and doesn't fire automatically on a missed call. A true missed-call text-back is triggered by the unanswered call itself, usually through your phone system or an AI receptionist.",
    },
    {
      q: "What should the first automated text say?",
      a: "Keep it short and specific: acknowledge you missed them, say who you are, and ask what they need — \"Sorry we missed your call! This is [Business]. What can we help with?\" A generic \"we'll call you back\" does less work than a message that invites them to just answer by text.",
    },
  ],
  sources: [
    {
      label: "Harvard Business Review — \"The Short Life of Online Sales Leads\" (Oldroyd, McElheran, Elkington)",
      url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads",
    },
    {
      label: "Google Business Profile Help — \"Chat with customers from your Business Profile\"",
      url: "https://support.google.com/business/answer/15013580",
    },
  ],
};
