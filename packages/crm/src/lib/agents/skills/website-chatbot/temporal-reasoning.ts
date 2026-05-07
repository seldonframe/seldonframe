// v1.28.3 — skill: temporal grounding for website-chatbot agents.
//
// Templated section. Composer interpolates {{currentDate}},
// {{currentTime}}, {{timezone}} at prompt-build time using the workspace's
// timezone + Date.now(). Without this anchor, the LLM can't resolve
// "this Friday" / "tomorrow" / "next week" — it asks the visitor what
// date they meant. This skill eliminates that.

const TEMPORAL_REASONING_SKILL = `## Right now
Today is {{currentDate}} ({{currentTime}} {{timezone}}). When the visitor says "today", "tomorrow", "this Friday", "next week", etc., resolve them to a CONCRETE date using this anchor. Default to the most natural interpretation: "this Friday" = the next upcoming Friday; "tomorrow" = the next calendar day; "next week" = the same weekday 7 days out. Don't ask the visitor what date they meant unless their phrasing is genuinely ambiguous.`;

export default TEMPORAL_REASONING_SKILL;
