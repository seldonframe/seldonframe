import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  fillPlaceholders,
  resolveDeploymentPersona,
  resolveReviewUrl,
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

describe("resolveDeploymentPersona — script/faq/services overrides (P2.1)", () => {
  test("script override is used VERBATIM and is NOT placeholder-filled (an explicit override is authored, not a template)", () => {
    // The deployment authored its own full script; even if it happens to contain
    // {tokens} they are NOT substituted — an explicit override is literal.
    const r = resolveDeploymentPersona({
      templateScript: "You are the receptionist for {business name}.",
      customization: {
        script: "Greet the caller, then book a slot for {business_name} — keep it warm.",
        businessInfo: { name: "Acme Plumbing" },
      },
    });
    assert.equal(
      r.prompt,
      "Greet the caller, then book a slot for {business_name} — keep it warm.",
    );
    assert.ok(r.prompt!.includes("{business_name}"), "the override's braces survive verbatim");
  });

  test("a blank/whitespace script override is treated as absent → template script is placeholder-filled", () => {
    const r = resolveDeploymentPersona({
      templateScript: "You are the receptionist for {business name}.",
      customization: { script: "   ", businessInfo: { name: "Acme Plumbing" } },
    });
    assert.equal(r.prompt, "You are the receptionist for Acme Plumbing.");
  });

  test("no script override → template script is placeholder-filled (existing behavior, unchanged)", () => {
    const r = resolveDeploymentPersona({
      templateScript: "You are the receptionist for {business name}.",
      customization: { businessInfo: { name: "Acme Plumbing" } },
    });
    assert.equal(r.prompt, "You are the receptionist for Acme Plumbing.");
  });

  test("faq override wins WHOLE over templateFaq (no element merge)", () => {
    const r = resolveDeploymentPersona({
      templateFaq: [{ q: "Template Q", a: "Template A" }],
      customization: {
        faq: [
          { q: "Do you offer free quotes?", a: "Yes, always." },
          { q: "Are you licensed?", a: "Fully licensed and insured." },
        ],
      },
    });
    assert.deepEqual(r.faq, [
      { q: "Do you offer free quotes?", a: "Yes, always." },
      { q: "Are you licensed?", a: "Fully licensed and insured." },
    ]);
  });

  test("absent customization.faq → templateFaq is returned", () => {
    const r = resolveDeploymentPersona({
      templateFaq: [{ q: "Template Q", a: "Template A" }],
      customization: { businessInfo: { name: "Acme Plumbing" } },
    });
    assert.deepEqual(r.faq, [{ q: "Template Q", a: "Template A" }]);
  });

  test("empty-array customization.faq is treated as ABSENT → falls back to templateFaq", () => {
    const r = resolveDeploymentPersona({
      templateFaq: [{ q: "Template Q", a: "Template A" }],
      customization: { faq: [] },
    });
    assert.deepEqual(r.faq, [{ q: "Template Q", a: "Template A" }]);
  });

  test("faq is null when neither customization nor template supplies one", () => {
    const r = resolveDeploymentPersona({});
    assert.equal(r.faq, null);
  });

  test("templateFaq null with no override → null faq", () => {
    const r = resolveDeploymentPersona({ templateFaq: null });
    assert.equal(r.faq, null);
  });

  test("services override wins WHOLE over templateServices (no element merge)", () => {
    const r = resolveDeploymentPersona({
      templateServices: [{ name: "Template Service" }],
      customization: {
        services: [
          { name: "Drain Cleaning", description: "Fast and clean", price: "$120" },
          { name: "Leak Repair" },
        ],
      },
    });
    assert.deepEqual(r.services, [
      { name: "Drain Cleaning", description: "Fast and clean", price: "$120" },
      { name: "Leak Repair" },
    ]);
  });

  test("absent customization.services → templateServices is returned", () => {
    const r = resolveDeploymentPersona({
      templateServices: [{ name: "Template Service", price: "$99" }],
      customization: { businessInfo: { name: "Acme Plumbing" } },
    });
    assert.deepEqual(r.services, [{ name: "Template Service", price: "$99" }]);
  });

  test("empty-array customization.services is treated as ABSENT → falls back to templateServices", () => {
    const r = resolveDeploymentPersona({
      templateServices: [{ name: "Template Service" }],
      customization: { services: [] },
    });
    assert.deepEqual(r.services, [{ name: "Template Service" }]);
  });

  test("services is null when neither customization nor template supplies one", () => {
    const r = resolveDeploymentPersona({});
    assert.equal(r.services, null);
  });

  test("greeting/voiceId/businessName remain byte-for-byte when faq/services are present", () => {
    // Adding the new overrides must not perturb the existing fields.
    const r = resolveDeploymentPersona({
      templateGreeting: "Thanks for calling {business_name}!",
      templateVoiceId: "cedar",
      customization: {
        businessInfo: { name: "Acme Plumbing" },
        faq: [{ q: "Q", a: "A" }],
        services: [{ name: "S" }],
      },
      clientName: "Ignored Client",
    });
    assert.equal(r.greeting, "Thanks for calling Acme Plumbing!");
    assert.equal(r.voiceId, "cedar");
    assert.equal(r.businessName, "Acme Plumbing");
  });
});

// ─── resolveReviewUrl (R1 — per-client review link precedence) ────────────────
//
// The Google review link is CLIENT-specific (it's the client's GBP "get more
// reviews" link), so it lives on the DEPLOYMENT's customization. The shared
// agent template only carries an agency-wide fallback (blueprint.reviewUrl).
// resolveReviewUrl encodes deployment-wins-over-template:
//   deployment.customization.reviewUrl ?? template.blueprint.reviewUrl ?? null.
describe("resolveReviewUrl — deployment wins over template", () => {
  const DEPLOY_URL = "https://g.page/r/client-own/review";
  const TEMPLATE_URL = "https://g.page/r/agency-default/review";

  test("deployment customization.reviewUrl wins over the template default", () => {
    assert.equal(
      resolveReviewUrl({
        customization: { reviewUrl: DEPLOY_URL },
        templateReviewUrl: TEMPLATE_URL,
      }),
      DEPLOY_URL,
    );
  });

  test("no deployment link → falls back to the template default", () => {
    assert.equal(
      resolveReviewUrl({ customization: {}, templateReviewUrl: TEMPLATE_URL }),
      TEMPLATE_URL,
    );
    // A null/absent customization behaves the same as an empty one.
    assert.equal(
      resolveReviewUrl({ customization: null, templateReviewUrl: TEMPLATE_URL }),
      TEMPLATE_URL,
    );
    assert.equal(
      resolveReviewUrl({ templateReviewUrl: TEMPLATE_URL }),
      TEMPLATE_URL,
    );
  });

  test("neither deployment nor template link → null (the no-URL skip case)", () => {
    assert.equal(resolveReviewUrl({ customization: {}, templateReviewUrl: null }), null);
    assert.equal(resolveReviewUrl({}), null);
    assert.equal(
      resolveReviewUrl({ customization: { reviewUrl: "" }, templateReviewUrl: "" }),
      null,
    );
  });

  test("a blank/whitespace deployment link is treated as absent → template wins", () => {
    assert.equal(
      resolveReviewUrl({
        customization: { reviewUrl: "   " },
        templateReviewUrl: TEMPLATE_URL,
      }),
      TEMPLATE_URL,
    );
    // null deployment link (the editor's CLEAR sentinel) also falls through.
    assert.equal(
      resolveReviewUrl({
        customization: { reviewUrl: null },
        templateReviewUrl: TEMPLATE_URL,
      }),
      TEMPLATE_URL,
    );
  });

  test("returns the trimmed link (no leading/trailing whitespace leaks)", () => {
    assert.equal(
      resolveReviewUrl({
        customization: { reviewUrl: `  ${DEPLOY_URL}  ` },
        templateReviewUrl: TEMPLATE_URL,
      }),
      DEPLOY_URL,
    );
  });
});
