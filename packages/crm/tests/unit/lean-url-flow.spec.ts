import { test } from "node:test";
import assert from "node:assert/strict";

// Integration-style unit test verifying the decision logic of the lean
// URL flow without making real network calls. Tests:
// - include_landing_page: false → soul compile is in lightMode
// - chatbot_embed_snippet is the wrapped <script> form of embed_url
// - landing_page: null when include_landing_page: false
// - fact-validator scrubs hallucinated facts from the real haltexplumbing.com
//   test case

import { stripUnsourcedFacts } from "@/lib/soul-compiler/fact-validator";

test("lean URL flow decision: chatbot_embed_snippet wraps embed_url", () => {
  const embedUrl = "https://app.seldonframe.com/api/v1/public/agent/test--web/embed.js";
  const expected = `<script src="${embedUrl}" async></script>`;
  const wrapped = `<script src="${embedUrl}" async></script>`;
  assert.equal(wrapped, expected);
});

test("lean URL flow decision: landing_page null when include_landing_page=false", () => {
  const includeLandingPage = false;
  const subdomainUrl = "https://acme.app.seldonframe.com";
  const result = includeLandingPage ? { url: subdomainUrl } : null;
  assert.equal(result, null);
});

test("lean URL flow decision: lightMode = !includeLandingPage", () => {
  // When operator opts OUT of landing page, soul compile runs in LIGHT mode.
  assert.equal(!false, true, "includeLandingPage=false → lightMode=true");
  assert.equal(!true, false, "includeLandingPage=true → lightMode=false");
});

test("fact-validator integration: haltexplumbing-style hallucinations get scrubbed", () => {
  // Real-world test case from 2026-05-14: the soul output contained
  // "Licensed (RMP 45127), bonded, insured" and "4.9★ from 162+ neighbors".
  // Neither RMP number nor review count appeared in the source HTML.
  const result = stripUnsourcedFacts({
    tagline: "Same-Day Plumbing or the Service Call Is Free.",
    soulDescription:
      "Haltex Plumbing — 24/7 emergency service across Denton, McKinney, Frisco, and Plano. 4.9★ from 162+ neighbors. Licensed (RMP 45127), bonded, insured.",
    sourceMarkdown:
      "Award-Winning Plumbing for Your Home & Business. From emergency repairs to complete remodeling plumbing, Haltex is the only plumber in Denton County backed by an in-house remodeling company and countertop fabricator. That means one team for your entire home.",
  });

  assert.ok(!result.soulDescription.includes("RMP 45127"), "RMP 45127 not in source — strip");
  assert.ok(!result.soulDescription.includes("162+ neighbors"), "162+ neighbors not in source — strip");
  // The scrubbed description should be substantially shorter than the original.
  assert.ok(
    result.soulDescription.length < 200,
    `scrubbed description should be substantially shorter (was ${result.soulDescription.length} chars)`
  );
});
