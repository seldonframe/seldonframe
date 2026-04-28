import { test } from "node:test";
import assert from "node:assert/strict";

import { renderFormbricksStackV1 } from "@/lib/blueprint/renderers/formbricks-stack-v1";
import { pickTemplate } from "@/lib/blueprint/templates";

// ─── Smoke / determinism / theme integration ──────────────────────────

test("renderFormbricksStackV1 — produces non-empty html + css for HVAC blueprint", () => {
  const blueprint = pickTemplate("hvac");
  blueprint.workspace.name = "Lone Star Comfort HVAC";
  const out = renderFormbricksStackV1(blueprint);
  assert.ok(out.html.length > 0, "html must be non-empty");
  assert.ok(out.css.length > 0, "css must be non-empty");
});

test("renderFormbricksStackV1 — output is byte-stable for same blueprint (deterministic)", () => {
  const a = renderFormbricksStackV1(pickTemplate("hvac"));
  const b = renderFormbricksStackV1(pickTemplate("hvac"));
  assert.equal(a.html, b.html, "html must be byte-stable");
  assert.equal(a.css, b.css, "css must be byte-stable");
});

test("renderFormbricksStackV1 — emits theme :root block (intake surface uses warm off-white)", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  assert.ok(out.css.includes("--sf-accent: "), "css should include accent token");
  assert.ok(
    out.css.includes("--sf-bg-primary: #FAFAF7"),
    "intake surface uses warm off-white (matches landing + booking)"
  );
});

// ─── Visual polish markers (matches landing + booking) ────────────────

test("renderFormbricksStackV1 — emits C3.x polish markers (frame, navbar, layered-shadow CTA, dark footer)", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  const POLISH_HTML = [
    "sf-frame",
    "sf-navbar",
    "sf-btn--primary",
    "sf-btn__icon",
    "Powered by",
  ];
  const POLISH_CSS = [
    "Instrument+Serif",
    "--sf-bg-primary",
    "sf-animate",
    "Cal Sans",
  ];
  for (const m of POLISH_HTML) assert.ok(out.html.includes(m), `html must contain ${m}`);
  for (const m of POLISH_CSS) assert.ok(out.css.includes(m), `css must contain ${m}`);
});

// ─── Intro panel ──────────────────────────────────────────────────────

test("renderFormbricksStackV1 — intro panel renders title from blueprint.intake.title", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  // hvac.json: "title": "Tell us about the job"
  assert.ok(out.html.includes("Tell us about the"), "intake title rendered");
});

test("renderFormbricksStackV1 — intro panel renders description when given", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  // hvac description: "Quick form. Takes about a minute. We'll call back within an hour during business hours."
  assert.ok(
    out.html.includes("Quick form. Takes about a minute"),
    "intake description rendered"
  );
});

test("renderFormbricksStackV1 — intro panel shows question count + estimated time", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  // hvac has 7 questions
  assert.ok(out.html.includes("7 questions"), "question count");
  // 7 * 8s = 56s, rounds to 1 minute
  assert.ok(out.html.includes("About 1 minute"), "time estimate");
});

// ─── Question panels ──────────────────────────────────────────────────

test("renderFormbricksStackV1 — emits one question panel per blueprint question", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  // Each question panel has data-panel="q-<id>"
  for (const q of blueprint.intake.questions) {
    assert.ok(
      out.html.includes(`data-panel="q-${q.id}"`),
      `panel for question ${q.id} present`
    );
  }
});

test("renderFormbricksStackV1 — each question is rendered with its label", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  for (const q of blueprint.intake.questions) {
    assert.ok(
      out.html.includes(q.label.replace(/'/g, "&#39;")),
      `label for ${q.id} present`
    );
  }
});

test("renderFormbricksStackV1 — required questions get visible required marker", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  // hvac has multiple required questions (fullName, phone, address, issueType, urgency)
  const requiredCount = blueprint.intake.questions.filter((q) => q.required).length;
  const markerCount = (out.html.match(/sf-intake__q-required/g) ?? []).length;
  assert.equal(markerCount, requiredCount, "one required marker per required question");
});

test("renderFormbricksStackV1 — text fields render <input type='text'>", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  // hvac fullName is type=text required
  assert.ok(/<input[^>]+type="text"[^>]+data-field-id="fullName"/.test(out.html));
});

test("renderFormbricksStackV1 — email fields render <input type='email'>", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  assert.ok(/<input[^>]+type="email"[^>]+data-field-id="email"/.test(out.html));
});

test("renderFormbricksStackV1 — phone fields render <input type='tel'>", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  assert.ok(/<input[^>]+type="tel"[^>]+data-field-id="phone"/.test(out.html));
});

test("renderFormbricksStackV1 — textarea fields render <textarea>", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  // hvac details field is type=textarea
  assert.ok(/<textarea[^>]+data-field-id="details"/.test(out.html));
});

test("renderFormbricksStackV1 — select fields render their option list as buttons", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  // hvac urgency field has 3 options
  const urgency = blueprint.intake.questions.find((q) => q.id === "urgency");
  assert.ok(urgency, "urgency question present");
  for (const opt of urgency!.options ?? []) {
    assert.ok(
      out.html.includes(`data-value="${opt.replace(/"/g, "&quot;")}"`),
      `option "${opt}" rendered`
    );
  }
});

test("renderFormbricksStackV1 — multi-select fields use role='checkbox' on each option", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  // hvac issueType is multi-select. Find options with role=checkbox.
  assert.ok(
    out.html.includes(`role="checkbox"`),
    "multi-select options use role=checkbox"
  );
  assert.ok(
    out.html.includes(`data-mode="multi"`),
    "multi-select container marked with data-mode=multi"
  );
});

// ─── Completion panel ─────────────────────────────────────────────────

test("renderFormbricksStackV1 — emits completion panel with headline + message", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  // hvac completion: { headline: "Thanks — we'll be in touch shortly", message: "If your issue is an emergency..." }
  assert.ok(out.html.includes("Thanks"), "completion headline present");
  assert.ok(
    out.html.includes(`data-panel="complete"`),
    "completion panel data-panel attribute"
  );
});

test("renderFormbricksStackV1 — completion panel hidden initially (intro is the default)", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  // Intro panel does NOT have hidden attribute
  assert.ok(/data-panel="intro"[^>]*>/.test(out.html));
  assert.ok(!/data-panel="intro"[^>]+hidden/.test(out.html));
  // All other panels DO have hidden attribute
  assert.ok(/data-panel="complete"[^>]+hidden/.test(out.html));
});

test("renderFormbricksStackV1 — first question panel hidden initially (intro precedes)", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  const firstQ = blueprint.intake.questions[0];
  const re = new RegExp(`data-panel="q-${firstQ.id}"[^>]+hidden`);
  assert.ok(re.test(out.html), `first question panel ${firstQ.id} starts hidden`);
});

// ─── Progress bar + controls ──────────────────────────────────────────

test("renderFormbricksStackV1 — emits progress bar shell", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  assert.ok(out.html.includes(`id="sf-intake-progress-fill"`));
  assert.ok(out.html.includes(`id="sf-intake-progress-label"`));
  assert.ok(out.html.includes(`id="sf-intake-progress-count"`));
});

test("renderFormbricksStackV1 — emits Back + Continue controls with proper ids", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  assert.ok(out.html.includes(`id="sf-intake-back"`));
  assert.ok(out.html.includes(`id="sf-intake-next"`));
  assert.ok(out.html.includes(`id="sf-intake-next-label"`));
});

// ─── XSS hardening (same vectors as booking) ──────────────────────────

test("renderFormbricksStackV1 — escapes user-supplied workspace name (XSS safety)", () => {
  const blueprint = pickTemplate("general");
  blueprint.workspace.name = `<script>alert("xss")</script>`;
  const out = renderFormbricksStackV1(blueprint);
  assert.ok(!out.html.includes(`<script>alert`), "raw <script>alert must not appear");
  assert.ok(!out.html.includes(`alert("xss")`), "alert call must not appear unescaped");
  assert.ok(out.html.includes("&lt;script&gt;"), "escaped form should appear");
});

test("renderFormbricksStackV1 — escapes < in JSON island (defense in depth)", () => {
  const blueprint = pickTemplate("general");
  // Plant a payload that would otherwise close the script tag.
  blueprint.workspace.name = `</script><img src=x onerror=alert(1)>`;
  const out = renderFormbricksStackV1(blueprint);
  // The </script> + <img must NOT appear inside the JSON-island block.
  const islandStart = out.html.indexOf(`id="sf-intake-data"`);
  const islandEnd = out.html.indexOf(`</script>`, islandStart);
  const island = out.html.slice(islandStart, islandEnd);
  assert.ok(!island.includes("</script"), "json island must not contain raw </script");
  assert.ok(!out.html.includes("<img src=x"), "raw img tag must not appear");
});

// ─── Data island ──────────────────────────────────────────────────────

test("renderFormbricksStackV1 — emits intake-data <script type=application/json> island", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  assert.ok(out.html.includes(`id="sf-intake-data"`));
  assert.ok(out.html.includes(`type="application/json"`));
});

test("renderFormbricksStackV1 — data island carries questions + completion", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderFormbricksStackV1(blueprint);
  const m = out.html.match(/id="sf-intake-data">([^<]+)<\/script>/);
  assert.ok(m, "data island present");
  const data = JSON.parse(m![1]);
  assert.equal(data.workspaceName, blueprint.workspace.name);
  assert.equal(data.intake.questions.length, blueprint.intake.questions.length);
  assert.equal(data.intake.completion.headline, blueprint.intake.completion.headline);
});

// ─── Footer parity with landing + booking ─────────────────────────────

test("renderFormbricksStackV1 — footer Powered-by SeldonFrame is present", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  assert.ok(out.html.includes("Powered by"));
  assert.ok(out.html.includes("seldonframe.com"));
});
