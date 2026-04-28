import { test } from "node:test";
import assert from "node:assert/strict";

import { renderGeneralServiceV1 } from "@/lib/blueprint/renderers/general-service-v1";
import { pickTemplate } from "@/lib/blueprint/templates";

test("pickTemplate — returns hvac for industry='hvac'", () => {
  const blueprint = pickTemplate("hvac");
  assert.equal(blueprint.workspace.industry, "hvac");
});

test("pickTemplate — falls back to general for unknown industry", () => {
  const blueprint = pickTemplate("not-a-real-industry");
  assert.equal(blueprint.workspace.industry, "general");
});

test("pickTemplate — returns deep clone (mutating result doesn't affect future calls)", () => {
  const a = pickTemplate("hvac");
  a.workspace.name = "MUTATED";
  const b = pickTemplate("hvac");
  assert.notEqual(b.workspace.name, "MUTATED", "second call should return fresh clone");
});

test("renderGeneralServiceV1 — produces non-empty html + css for HVAC blueprint", () => {
  const blueprint = pickTemplate("hvac");
  blueprint.workspace.name = "Lone Star Comfort HVAC";
  const out = renderGeneralServiceV1(blueprint);
  assert.ok(out.html.length > 0, "html must be non-empty");
  assert.ok(out.css.length > 0, "css must be non-empty");
});

test("renderGeneralServiceV1 — escapes workspace name (XSS safety)", () => {
  const blueprint = pickTemplate("general");
  blueprint.workspace.name = `<script>alert("xss")</script>`;
  const out = renderGeneralServiceV1(blueprint);
  assert.ok(!out.html.includes("<script>"), "raw <script> tag must not appear in output");
  assert.ok(out.html.includes("&lt;script&gt;"), "escaped form should appear");
});

test("renderGeneralServiceV1 — embeds the workspace name in the footer", () => {
  const blueprint = pickTemplate("hvac");
  blueprint.workspace.name = "Acme Heating Test 12345";
  const out = renderGeneralServiceV1(blueprint);
  assert.ok(out.html.includes("Acme Heating Test 12345"), "name should appear in footer brand");
});

test("renderGeneralServiceV1 — emits the theme-token :root block as part of css", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderGeneralServiceV1(blueprint);
  assert.ok(out.css.includes("--sf-accent: "), "css should include theme tokens");
  assert.ok(out.css.includes(".sf-landing"), "css should include base landing styles");
});

test("renderGeneralServiceV1 — landing background is warm off-white #FAFAF7 for HVAC", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderGeneralServiceV1(blueprint);
  assert.ok(out.css.includes("--sf-bg-primary: #FAFAF7;"), "landing surface should use warm off-white");
});

test("renderGeneralServiceV1 — HVAC blueprint includes emergency-strip in output", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderGeneralServiceV1(blueprint);
  assert.ok(out.html.includes("sf-emergency"), "HVAC includes the emergency strip");
});

test("renderGeneralServiceV1 — general blueprint does NOT include emergency-strip", () => {
  const blueprint = pickTemplate("general");
  const out = renderGeneralServiceV1(blueprint);
  assert.ok(!out.html.includes("sf-emergency"), "general template skips the emergency strip");
});

test("renderGeneralServiceV1 — output is byte-stable for the same blueprint (deterministic)", () => {
  const a = renderGeneralServiceV1(pickTemplate("hvac"));
  const b = renderGeneralServiceV1(pickTemplate("hvac"));
  assert.equal(a.html, b.html, "html must be byte-stable across calls");
  assert.equal(a.css, b.css, "css must be byte-stable across calls");
});

test("renderGeneralServiceV1 — services-grid renders all items from blueprint", () => {
  const blueprint = pickTemplate("hvac");
  // hvac.json's services grid has 6 items
  const out = renderGeneralServiceV1(blueprint);
  const serviceCardCount = (out.html.match(/class="sf-service"/g) ?? []).length;
  assert.equal(serviceCardCount, 6, "HVAC has 6 services");
});

test("renderGeneralServiceV1 — testimonials have a featured quote + grid items", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderGeneralServiceV1(blueprint);
  assert.ok(out.html.includes("sf-testimonials__featured"), "featured quote present");
  assert.ok(out.html.includes("sf-testimonials__grid"), "grid present");
});

test("renderGeneralServiceV1 — FAQ uses <details>/<summary> for accordion", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderGeneralServiceV1(blueprint);
  assert.ok(out.html.includes("<details class=\"sf-faq__item\">"), "FAQ uses native accordion");
});

test("renderGeneralServiceV1 — footer powered-by SeldonFrame is present", () => {
  const blueprint = pickTemplate("general");
  const out = renderGeneralServiceV1(blueprint);
  assert.ok(out.html.includes("Powered by"), "powered-by present");
  assert.ok(out.html.includes("seldonframe.com"), "links to seldonframe.com");
});
