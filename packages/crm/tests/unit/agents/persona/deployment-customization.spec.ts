import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  fillPlaceholders,
  resolveDeploymentPersona,
} from "../../../../src/lib/agents/persona/deployment-customization";

describe("fillPlaceholders", () => {
  test("fills a known token from vars", () => {
    assert.equal(
      fillPlaceholders("Thanks for calling {business_name}!", { business_name: "Max ABC" }),
      "Thanks for calling Max ABC!",
    );
  });

  test("drops an unknown/blank token leaving NO literal brace + tidies the space before '!'", () => {
    // No business_name supplied → token removed, the dangling space before '!'
    // is cleaned up. The agent must NEVER read a literal "{business_name}" aloud.
    const out = fillPlaceholders("Thanks for calling {business_name}!", {});
    assert.equal(out, "Thanks for calling!");
    assert.ok(!out.includes("{"), "no literal '{' may survive");
  });

  test("blank-string value is treated as missing (dropped, not substituted)", () => {
    assert.equal(
      fillPlaceholders("Thanks for calling {business_name}!", { business_name: "   " }),
      "Thanks for calling!",
    );
  });

  test("drops a token before a period and tidies the dangling space (exact output)", () => {
    // The chosen tidy rule: drop the token, collapse double spaces, strip a space
    // before terminal punctuation, trim. "…great {time_of_day}." → "…great."
    assert.equal(
      fillPlaceholders("Thanks, have a great {time_of_day}.", {}),
      "Thanks, have a great.",
    );
  });

  test("collapses the double space left mid-sentence when a token is dropped", () => {
    assert.equal(fillPlaceholders("Call {business_name} today", {}), "Call today");
  });

  test("strips the dangling space before a comma when a token is dropped", () => {
    assert.equal(fillPlaceholders("Hi {business_name}, welcome", {}), "Hi, welcome");
  });

  test("token matching is case- and space-insensitive (Business Name / business_name / { business name })", () => {
    const vars = { business_name: "Acme" };
    assert.equal(fillPlaceholders("A {Business Name} B", vars), "A Acme B");
    assert.equal(fillPlaceholders("A {business_name} B", vars), "A Acme B");
    assert.equal(fillPlaceholders("A { business name } B", vars), "A Acme B");
  });

  test("fills multiple distinct tokens in one pass", () => {
    assert.equal(
      fillPlaceholders("{business_name} is open {hours}.", {
        business_name: "Acme",
        hours: "9-5",
      }),
      "Acme is open 9-5.",
    );
  });

  test("text with no tokens is returned unchanged", () => {
    assert.equal(fillPlaceholders("Hello there", { business_name: "Acme" }), "Hello there");
  });
});

describe("resolveDeploymentPersona", () => {
  test("deployment greeting override wins over the template greeting", () => {
    const r = resolveDeploymentPersona({
      templateGreeting: "Thanks for calling {business_name}!",
      customization: { greeting: "Hey, this is Sam — how can I help?" },
      clientName: "Max ABC",
    });
    assert.equal(r.greeting, "Hey, this is Sam — how can I help?");
  });

  test("template greeting placeholder is filled from businessInfo.name", () => {
    const r = resolveDeploymentPersona({
      templateGreeting: "Thanks for calling {business_name}!",
      customization: { businessInfo: { name: "Acme Plumbing" } },
    });
    assert.equal(r.greeting, "Thanks for calling Acme Plumbing!");
    assert.equal(r.businessName, "Acme Plumbing");
  });

  test("businessName falls back to clientName when businessInfo.name is absent", () => {
    const r = resolveDeploymentPersona({
      templateGreeting: "Thanks for calling {business_name}!",
      clientName: "Max ABC",
    });
    assert.equal(r.businessName, "Max ABC");
    assert.equal(r.greeting, "Thanks for calling Max ABC!");
  });

  test("voiceId precedence: deployment override beats template", () => {
    const r = resolveDeploymentPersona({
      templateVoiceId: "cedar",
      customization: { voiceId: "marin" },
    });
    assert.equal(r.voiceId, "marin");
  });

  test("voiceId falls back to template when deployment has none", () => {
    const r = resolveDeploymentPersona({ templateVoiceId: "cedar" });
    assert.equal(r.voiceId, "cedar");
  });

  test("templateScript with {business name} + no businessInfo → token dropped, no literal brace in prompt", () => {
    // This is the live leak fix: the closing line of a script must not read a raw
    // placeholder when the deployment has no business name.
    const r = resolveDeploymentPersona({
      templateScript: "...thanks for calling {business name}, have a great day.",
    });
    assert.ok(r.prompt !== null);
    assert.ok(!r.prompt!.includes("{"), "no literal '{' may survive in the prompt");
    assert.equal(r.prompt, "...thanks for calling, have a great day.");
  });

  test("templateScript {business name} IS filled when businessInfo.name is present", () => {
    const r = resolveDeploymentPersona({
      templateScript: "You are the receptionist for {business name}.",
      customization: { businessInfo: { name: "Acme Plumbing" } },
    });
    assert.equal(r.prompt, "You are the receptionist for Acme Plumbing.");
  });

  test("null templates → null greeting/prompt; absent customization → null voiceId/businessName", () => {
    const r = resolveDeploymentPersona({});
    assert.equal(r.greeting, null);
    assert.equal(r.prompt, null);
    assert.equal(r.voiceId, null);
    assert.equal(r.businessName, null);
  });

  test("businessInfo hours/address/phone/email also fill their tokens in the script", () => {
    const r = resolveDeploymentPersona({
      templateScript: "We are open {hours} at {address}. Call {phone} or email {email}.",
      customization: {
        businessInfo: {
          hours: "Mon-Fri 9-5",
          address: "123 Main St",
          phone: "555-1234",
          email: "hi@acme.test",
        },
      },
    });
    assert.equal(
      r.prompt,
      "We are open Mon-Fri 9-5 at 123 Main St. Call 555-1234 or email hi@acme.test.",
    );
  });
});
