// Unit tests for detectVertical — the pure client-side vertical detector
// used by the /clients/new Build Animation v2 to render "Stage A" mock
// content (services, booking CTA, intake fields, etc.) before the real
// `soul_built` SSE event arrives.
//
// The function is small (one keyword scan) but has a lot of contract
// surface to verify:
//   - URL inputs match keywords on the hostname OR the full input.
//   - Paste inputs match keywords across the full text.
//   - First match wins (rule order is priority).
//   - Business name inference handles both URL and paste shapes.
//   - The fallback is technical-restrained.
//   - All archetype slugs in the rules table exist in aesthetic-archetypes.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ARCHETYPE_LABELS,
  FALLBACK_RULE,
  VERTICAL_RULES,
  detectVertical,
  inferBusinessName,
  inferInputDisplay,
  inferPublishSubdomain,
} from "../../src/lib/workspace/detect-vertical";
import { ARCHETYPES } from "../../src/lib/workspace/aesthetic-archetypes";

describe("detectVertical — URL routing", () => {
  test("HVAC URL → bold-urgency", () => {
    const r = detectVertical({ kind: "url", value: "https://acme-hvac.com" });
    assert.equal(r.rule.archetype, "bold-urgency");
    assert.equal(r.rule.vertical, "HVAC");
    assert.equal(r.businessName, "Acme Hvac");
  });

  test("plumbing keyword in path → bold-urgency", () => {
    const r = detectVertical({
      kind: "url",
      value: "https://east-bay-plumbing.com/about",
    });
    assert.equal(r.rule.archetype, "bold-urgency");
  });

  test("emergency keyword in path matches via raw value", () => {
    // 'emergency' is one of the bold-urgency keywords. It appears in the
    // PATH not the host, but the raw input lowercase test catches it.
    const r = detectVertical({
      kind: "url",
      value: "https://24-7-restoration.com/emergency",
    });
    assert.equal(r.rule.archetype, "bold-urgency");
  });

  test("dental URL → clinical-trust", () => {
    const r = detectVertical({ kind: "url", value: "https://smile-dental.com" });
    assert.equal(r.rule.archetype, "clinical-trust");
    assert.equal(r.rule.vertical, "Dental practice");
  });

  test("medspa URL → cinematic-aspirational", () => {
    const r = detectVertical({
      kind: "url",
      value: "https://stillwater-aesthetics.com",
    });
    assert.equal(r.rule.archetype, "cinematic-aspirational");
  });

  test("accounting URL → technical-restrained", () => {
    const r = detectVertical({
      kind: "url",
      value: "https://northwind-accounting.com",
    });
    assert.equal(r.rule.archetype, "technical-restrained");
  });

  test("lawn URL → soft-residential", () => {
    const r = detectVertical({
      kind: "url",
      value: "https://green-thumb-lawn.com",
    });
    assert.equal(r.rule.archetype, "soft-residential");
  });

  test("coffee URL → editorial-warm", () => {
    const r = detectVertical({
      kind: "url",
      value: "https://oak-and-iron-coffee.com",
    });
    assert.equal(r.rule.archetype, "editorial-warm");
    assert.equal(r.businessName, "Oak And Iron Coffee");
  });

  test("studio URL → brutalist", () => {
    const r = detectVertical({ kind: "url", value: "https://field-studio.com" });
    assert.equal(r.rule.archetype, "brutalist");
  });

  test("lawn URL does NOT match consultancy 'law' keyword (regression)", () => {
    // 'law' is a consultancy keyword. Without word-boundary matching the
    // substring 'law' inside 'lawn' would route to technical-restrained.
    const r = detectVertical({
      kind: "url",
      value: "https://triangle-lawn-care.com",
    });
    assert.equal(r.rule.archetype, "soft-residential");
  });

  test("tower URL does NOT match bold-urgency 'tow' keyword (regression)", () => {
    const r = detectVertical({
      kind: "url",
      value: "https://water-tower-cafe.com",
    });
    // 'cafe' is the editorial-warm keyword — should win.
    assert.equal(r.rule.archetype, "editorial-warm");
  });

  test("unknown URL → fallback (technical-restrained)", () => {
    const r = detectVertical({
      kind: "url",
      value: "https://unrelated-thing.example",
    });
    assert.equal(r.rule.archetype, "technical-restrained");
    assert.equal(r.rule, FALLBACK_RULE);
  });
});

describe("detectVertical — paste routing", () => {
  test("dental paste → clinical-trust", () => {
    const r = detectVertical({
      kind: "biz",
      value: "Family dental practice in Auburn, CA. Cleanings and implants.",
    });
    assert.equal(r.rule.archetype, "clinical-trust");
  });

  test("lawn paste → soft-residential", () => {
    const r = detectVertical({
      kind: "biz",
      value:
        "Family-owned lawn care in Raleigh, NC. Weekly mowing, no contracts. Same crew every visit.",
    });
    assert.equal(r.rule.archetype, "soft-residential");
  });

  test("nothing matches → fallback technical-restrained", () => {
    const r = detectVertical({
      kind: "biz",
      value: "A general business that does general things.",
    });
    assert.equal(r.rule.archetype, "technical-restrained");
  });

  test("empty input → fallback", () => {
    const r = detectVertical({ kind: "biz", value: "" });
    assert.equal(r.rule, FALLBACK_RULE);
    assert.equal(r.businessName, "");
  });
});

describe("inferBusinessName", () => {
  test("URL: dashes get title-cased", () => {
    assert.equal(
      inferBusinessName({ kind: "url", value: "https://acme-hvac.com" }),
      "Acme Hvac",
    );
  });

  test("URL: www. is stripped", () => {
    assert.equal(
      inferBusinessName({ kind: "url", value: "https://www.smile-dental.com" }),
      "Smile Dental",
    );
  });

  test("URL: path is stripped", () => {
    assert.equal(
      inferBusinessName({
        kind: "url",
        value: "https://acme-hvac.com/services/ac-repair",
      }),
      "Acme Hvac",
    );
  });

  test("biz paste: first capitalized phrase wins", () => {
    assert.equal(
      inferBusinessName({
        kind: "biz",
        value: "Acme Plumbing is a family business in Stockton.",
      }),
      "Acme Plumbing",
    );
  });

  test("biz paste: no capitalized phrase falls back to first 3 words", () => {
    assert.equal(
      inferBusinessName({
        kind: "biz",
        value: "just some lowercase text here without proper nouns",
      }),
      "just some lowercase",
    );
  });
});

describe("inferInputDisplay", () => {
  test("URL: protocol and trailing slash stripped", () => {
    assert.equal(
      inferInputDisplay({ kind: "url", value: "https://acme-hvac.com/" }),
      "acme-hvac.com",
    );
  });

  test("biz: first 6 words rendered then ellipsis", () => {
    const out = inferInputDisplay({
      kind: "biz",
      value: "one two three four five six seven eight nine",
    });
    assert.equal(out, "one two three four five six…");
  });
});

describe("inferPublishSubdomain", () => {
  test("URL: subdomain matches hostname slug", () => {
    assert.equal(
      inferPublishSubdomain({ kind: "url", value: "https://acme-hvac.com" }),
      "acme-hvac.seldonframe.app",
    );
  });

  test("biz: business name gets slugified", () => {
    assert.equal(
      inferPublishSubdomain({
        kind: "biz",
        value: "Acme Plumbing serves the East Bay.",
      }),
      "acme-plumbing.seldonframe.app",
    );
  });
});

describe("VERTICAL_RULES — invariants", () => {
  test("every rule references a real archetype", () => {
    for (const r of VERTICAL_RULES) {
      assert.ok(
        r.archetype in ARCHETYPES,
        `Rule for ${r.vertical} references unknown archetype ${r.archetype}`,
      );
    }
  });

  test("every rule has at least one keyword", () => {
    for (const r of VERTICAL_RULES) {
      assert.ok(
        r.keywords.length > 0,
        `Rule ${r.vertical} has no keywords`,
      );
    }
  });

  test("ARCHETYPE_LABELS covers every archetype id", () => {
    for (const id of Object.keys(ARCHETYPES)) {
      assert.ok(id in ARCHETYPE_LABELS, `Missing label for ${id}`);
    }
  });

  test("FALLBACK_RULE is technical-restrained", () => {
    assert.equal(FALLBACK_RULE.archetype, "technical-restrained");
  });
});
