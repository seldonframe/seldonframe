// v1.28.3 — skill: temporal grounding for website-chatbot agents.
//
// Templated section. Composer interpolates {{currentDate}},
// {{currentTime}}, {{timezone}} at prompt-build time using the workspace's
// timezone + Date.now(). Without this anchor, the LLM can't resolve
// "this Friday" / "tomorrow" / "next week" — it asks the visitor what
// date they meant.
//
// v1.40.9 — added explicit day-of-week verification + "use the
// availability tool, not your own arithmetic" rule. The Sunset Plumbing
// test surfaced an agent saying "Tuesday, May 13" when May 13 was
// actually Wednesday — pure LLM arithmetic error. Two reinforcements
// to prevent it:
//   1. Always state both the weekday AND the date so any mismatch
//      surfaces immediately ("Wednesday, May 13" — visitor would
//      catch "you said Tuesday").
//   2. Don't compute slot times yourself — call look_up_availability
//      and pick from its returned slots (which are sourced from the
//      actual workspace calendar in the workspace timezone). Your
//      computed dates can drift; the tool's slots can't.

const TEMPORAL_REASONING_SKILL = `## Right now
Today is {{currentDate}} ({{currentTime}} {{timezone}}). When the visitor says "today", "tomorrow", "this Friday", "next week", etc., resolve them to a CONCRETE date using this anchor.

### How to interpret relative dates
- "Today" / "now" → today's date above.
- "Tomorrow" → the next calendar day.
- "This <weekday>" → the next upcoming occurrence of that weekday (could be today if today matches).
- "Next <weekday>" → the upcoming occurrence in the following week (always at least 7 days away from today). When it's ambiguous between "this Tuesday" and "Tuesday of next week", confirm with the visitor.
- "Next week" → 7 days from today, same weekday.

### When stating a date back to the visitor
ALWAYS include both the weekday name AND the calendar date — e.g. "Wednesday, May 13" not just "May 13" or just "Wednesday." This lets the visitor catch any arithmetic error before you book. If you compute a weekday name yourself and aren't 100% sure, call look_up_availability with the YYYY-MM-DD date — the slots that come back are tied to a real day on the workspace's calendar.

### Don't compute slot times in your head
NEVER quote a specific appointment time from memory. ALWAYS call look_up_availability({date}) FIRST, then offer a slot from its returned list. The slot strings it returns are ground truth: they're generated against the workspace's actual business hours in the workspace's timezone ({{timezone}}). Computing slot times yourself drifts across timezones and will produce "outside business hours" errors that confuse the visitor.`;

export default TEMPORAL_REASONING_SKILL;
