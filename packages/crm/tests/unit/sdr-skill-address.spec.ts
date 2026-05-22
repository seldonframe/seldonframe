// 2026-05-22 — Polish #2: the SDR skill (website-chatbot/sdr.ts) asks
// for a full street address, not just a ZIP code. Operators need
// street + city + state + ZIP to dispatch trucks, and a single ZIP is
// frequently insufficient (split ZIP, wrong rooftop).
//
// These tests guard the SDR template literal against silent regressions
// where someone re-introduces "ZIP" as the primary location ask. The
// template is plain string content rendered into the system prompt at
// runtime via composeSystemPrompt -> renderSkill, so a flat string
// assertion is sufficient — no need to spin up the runtime.
//
// Allowed: "ZIP" appearing as one component inside a fuller address
// phrasing ("street, city, state, ZIP"). Disallowed: ZIP appearing as
// the sole/primary location ask (e.g., "What's your ZIP code?" with
// no parenthetical clarifying that more is wanted).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import sdrSkill from "../../src/lib/agents/skills/website-chatbot/sdr";

describe("sdr skill — Polish #2 (address-first ask)", () => {
  test("asks for a full street address somewhere in the skill", () => {
    // Lowercase the haystack so both 'address' and 'Address' match.
    const lower = sdrSkill.toLowerCase();
    assert.ok(
      lower.includes("street address"),
      `expected the SDR skill to ask for a "street address" but found none — got:\n${sdrSkill}`,
    );
  });

  test("mentions street, city, state, ZIP as the address components", () => {
    const lower = sdrSkill.toLowerCase();
    for (const component of ["street", "city", "state", "zip"]) {
      assert.ok(
        lower.includes(component),
        `expected SDR skill to enumerate "${component}" as an address component`,
      );
    }
  });

  test("Step 3 (qualify location) no longer asks ONLY for ZIP code", () => {
    // The old line was: > "What's your ZIP code?" (or "what city are you in?" if more natural).
    // We require that line — and any line in the location-qualify step — to
    // ask for full address rather than just ZIP.
    assert.ok(
      !/What's your ZIP code\?/.test(sdrSkill),
      "SDR skill still contains the old 'What's your ZIP code?' question — should ask for full street address",
    );
  });

  test("emergency triage capture no longer says 'name, phone, and ZIP' alone", () => {
    // The old emergency line ended with "...your name, phone, and ZIP?"
    // After the fix, it must request address (or full street address).
    assert.ok(
      !/name,?\s+phone,?\s+and\s+ZIP\??/i.test(sdrSkill),
      "emergency triage line still asks for 'name, phone, and ZIP' — should ask for full street address instead",
    );
  });

  test("Step 5 capture summary references address, not just ZIP", () => {
    // Old: "With name + phone + ZIP + service + sense of urgency:"
    assert.ok(
      !/name\s*\+\s*phone\s*\+\s*ZIP\s*\+\s*service/i.test(sdrSkill),
      "Step 5 still summarizes capture as 'name + phone + ZIP + service' — should mention address",
    );
  });
});
