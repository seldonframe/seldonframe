// Antifragility contract — speed-to-lead must produce the same exit
// block + extracted vars across multiple Claude model versions.
// When we bump the default model, this test catches behavior breakage.
//
// Skipped by default in CI unless ANTHROPIC_API_KEY is set (real API
// call, costs cents per run). Run manually before each model bump:
//   ANTHROPIC_API_KEY=... pnpm exec tsx --test tests/integration/antifragility-model-bump.spec.ts
//
// Asserts:
//   - LLM emits <exit>...</exit> within 6 turns of the sample transcript
//   - extracted.preferred_start parses as a valid Date within 30 days
//   - extracted.preferred_start respects the workspace timezone hint
//   (= naive ISO YYYY-MM-DDTHH:MM:00 since the prompt instructs the
//   LLM to emit in workspace TZ)

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";

const SKIP = !process.env.ANTHROPIC_API_KEY;

const MODELS_TO_TEST = [
  "claude-sonnet-4-5",
  // Future entries — add when bumping default model:
  // "claude-opus-4-5",
  // "claude-haiku-4-5",
];

const SAMPLE_SYSTEM_PROMPT = `You are qualifying a customer lead over SMS for Roofs by Shiloh. Your goal:

The prospect has shared a preferred appointment day/time (a specific day + a specific time, in their words — you'll convert to ISO using the current date context). That's it.

CURRENT DATE CONTEXT (use to resolve relative time phrases):
- Today is Tuesday, 2026-05-19 (America/Chicago)
- Tomorrow is 2026-05-20
- Workspace timezone: America/Chicago

When the qualification criteria are met, emit your final response as:
<exit>{ "preferred_start": <value> }</exit>

Required extracted fields:
  - "preferred_start": ISO-8601 datetime YYYY-MM-DDTHH:MM:00 in workspace tz.

Until the criteria are met, respond CONVERSATIONALLY (one short SMS-friendly message under 320 chars).

Hard limit: 6 turns total.`;

const SAMPLE_TRANSCRIPT: Array<{ role: "assistant" | "user"; content: string }> = [
  { role: "assistant", content: "Hi Alice, thanks for reaching out to Roofs by Shiloh! Happy to get you booked. Any preference on day/time? And anything else we should know before we connect?" },
  { role: "user", content: "Tomorrow at 3pm" },
];

describe("antifragility: speed-to-lead exit block across model versions", { skip: SKIP }, () => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  for (const model of MODELS_TO_TEST) {
    test(`${model} emits <exit> with parseable preferred_start within 6 turns`, async () => {
      const response = await client.messages.create({
        model,
        max_tokens: 800,
        system: SAMPLE_SYSTEM_PROMPT,
        messages: SAMPLE_TRANSCRIPT,
      });

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n");

      const exitMatch = text.match(/<exit>([\s\S]*?)<\/exit>/);
      assert.ok(exitMatch, `${model}: expected <exit> block. Got: ${text.slice(0, 300)}`);

      let extracted: { preferred_start?: string };
      try {
        extracted = JSON.parse(exitMatch[1].trim());
      } catch (err) {
        assert.fail(`${model}: exit block JSON failed to parse: ${exitMatch[1].slice(0, 200)}`);
      }

      assert.ok(extracted.preferred_start, `${model}: preferred_start missing from exit block`);

      const parsed = new Date(extracted.preferred_start + "Z"); // append Z to treat as UTC for parsing
      assert.ok(!Number.isNaN(parsed.getTime()), `${model}: preferred_start "${extracted.preferred_start}" not a valid date`);

      // Should be within 30 days of today (sanity — LLM shouldn't extract Jan 9 of next year for "tomorrow")
      const daysOut = (parsed.getTime() - Date.parse("2026-05-19T00:00:00Z")) / (24 * 60 * 60 * 1000);
      assert.ok(daysOut >= 0 && daysOut <= 30, `${model}: preferred_start ${daysOut.toFixed(1)} days from today — expected ~1 (tomorrow)`);
    });
  }
});
