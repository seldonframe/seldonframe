import { test } from "node:test";
import assert from "node:assert/strict";

import { renderCalcomMonthV1 } from "@/lib/blueprint/renderers/calcom-month-v1";
import { pickTemplate } from "@/lib/blueprint/templates";

// ─── Smoke / determinism / theme integration ──────────────────────────

test("renderCalcomMonthV1 — produces non-empty html + css for HVAC blueprint", () => {
  const blueprint = pickTemplate("hvac");
  blueprint.workspace.name = "Lone Star Comfort HVAC";
  const out = renderCalcomMonthV1(blueprint);
  assert.ok(out.html.length > 0, "html must be non-empty");
  assert.ok(out.css.length > 0, "css must be non-empty");
});

test("renderCalcomMonthV1 — output is byte-stable for same blueprint (deterministic)", () => {
  const a = renderCalcomMonthV1(pickTemplate("hvac"));
  const b = renderCalcomMonthV1(pickTemplate("hvac"));
  assert.equal(a.html, b.html, "html must be byte-stable");
  assert.equal(a.css, b.css, "css must be byte-stable");
});

test("renderCalcomMonthV1 — emits theme :root block as part of css", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
  assert.ok(out.css.includes("--sf-accent: "), "css should include accent token");
  assert.ok(out.css.includes("--sf-bg-primary: #FAFAF7"), "booking surface uses warm off-white");
});

test("renderCalcomMonthV1 — escapes user-supplied workspace name (XSS safety)", () => {
  const blueprint = pickTemplate("general");
  blueprint.workspace.name = `<script>alert("xss")</script>`;
  const out = renderCalcomMonthV1(blueprint);
  // The renderer legitimately injects an interactivity script tag, so we
  // assert specifically against the malicious payload (not any <script>).
  assert.ok(!out.html.includes(`<script>alert`), "raw <script>alert must not appear");
  assert.ok(!out.html.includes(`alert("xss")`), "alert call must not appear unescaped");
  assert.ok(out.html.includes("&lt;script&gt;"), "escaped form should appear");
});

// ─── Visual polish markers (matches landing's C3.x) ───────────────────

test("renderCalcomMonthV1 — emits C3.x polish markers (frame, navbar, layered-shadow CTA, dark footer)", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
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

// ─── v1.1.5 / Issue #7 — workspace timezone defaults ─────────────────────

test("renderCalcomMonthV1 — defaults state.timezone to data.workspaceTimezone (not browser TZ)", () => {
  const blueprint = pickTemplate("hvac");
  blueprint.workspace.contact.timezone = "America/Chicago";
  const out = renderCalcomMonthV1(blueprint);
  // Initial-state init from line 605: `state = { timezone: data.workspaceTimezone || 'UTC' }`
  assert.ok(
    out.html.includes(`"workspaceTimezone":"America/Chicago"`),
    "embedded data should expose the workspace's IANA TZ"
  );
  // setupTimezone now prefers workspaceTimezone over browser detection.
  assert.ok(
    out.html.includes("urlTz || data.workspaceTimezone || detected || 'UTC'"),
    "setupTimezone should fall back through urlTz → workspaceTimezone → detected"
  );
});

test("renderCalcomMonthV1 — supports ?tz= URL override", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
  // The readTzFromUrl helper parses ?tz= for shareable links.
  assert.ok(
    out.html.includes("URLSearchParams"),
    "client script should read URL params for tz override"
  );
  assert.ok(
    out.html.includes("function readTzFromUrl"),
    "client script should expose readTzFromUrl helper"
  );
});

test("renderCalcomMonthV1 — emits tzContextSuffix for visitor-vs-workspace clarity", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
  assert.ok(
    out.html.includes("tzContextSuffix"),
    "renderer should append a workspace-TZ suffix when visitor switches zones"
  );
});

// ─── Event details ────────────────────────────────────────────────────

test("renderCalcomMonthV1 — renders event title from blueprint.booking.eventType", () => {
  const blueprint = pickTemplate("hvac");
  // hvac.json: "title": "Free in-home estimate"
  const out = renderCalcomMonthV1(blueprint);
  assert.ok(out.html.includes("Free in-home"), "event title rendered");
});

test("renderCalcomMonthV1 — renders duration in minutes", () => {
  const blueprint = pickTemplate("hvac");
  blueprint.booking.eventType.durationMinutes = 45;
  const out = renderCalcomMonthV1(blueprint);
  assert.ok(out.html.includes("45 minutes"), "duration label rendered");
});

test("renderCalcomMonthV1 — emits location label based on location.kind", () => {
  const blueprint = pickTemplate("hvac");
  // hvac uses on-site-customer
  const out = renderCalcomMonthV1(blueprint);
  assert.ok(
    out.html.includes("On-site at your location"),
    "on-site-customer location label"
  );
});

test("renderCalcomMonthV1 — phone-call location renders correct label", () => {
  const blueprint = pickTemplate("general");
  blueprint.booking.eventType.location = { kind: "phone" };
  const out = renderCalcomMonthV1(blueprint);
  assert.ok(out.html.includes("Phone call"), "phone-call location label");
});

test("renderCalcomMonthV1 — video-call shows provider name when given", () => {
  const blueprint = pickTemplate("general");
  blueprint.booking.eventType.location = { kind: "video", videoProvider: "zoom" };
  const out = renderCalcomMonthV1(blueprint);
  assert.ok(out.html.includes("Zoom video call"), "zoom provider label");
});

// ─── Form fields ──────────────────────────────────────────────────────

test("renderCalcomMonthV1 — renders all booking form fields from blueprint", () => {
  const blueprint = pickTemplate("hvac");
  // hvac.json has 6 form fields: name, email, phone, address, service, notes
  const out = renderCalcomMonthV1(blueprint);
  for (const field of blueprint.booking.formFields) {
    assert.ok(
      out.html.includes(`name="${field.id}"`),
      `field "${field.id}" must be rendered with name attr`
    );
  }
});

test("renderCalcomMonthV1 — required fields get the `required` attribute", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderCalcomMonthV1(blueprint);
  // First field in hvac is "name" which is required
  assert.ok(
    /<input[^>]+name="name"[^>]+required/.test(out.html),
    "required field has required attribute"
  );
});

test("renderCalcomMonthV1 — select fields render their option list", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderCalcomMonthV1(blueprint);
  // hvac has a "service" select with 6 options
  assert.ok(out.html.includes("AC not cooling"), "select option rendered");
  assert.ok(out.html.includes("New system install"), "select option rendered");
});

test("renderCalcomMonthV1 — textarea fields render as textarea elements", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderCalcomMonthV1(blueprint);
  // hvac "notes" field is type=textarea
  assert.ok(
    /<textarea[^>]+name="notes"/.test(out.html),
    "textarea field rendered"
  );
});

// ─── Confirmation copy ────────────────────────────────────────────────

test("renderCalcomMonthV1 — embeds confirmation headline + message in HTML", () => {
  const blueprint = pickTemplate("hvac");
  // hvac confirmation: { headline: "Your estimate is booked", message: "We'll send..." }
  const out = renderCalcomMonthV1(blueprint);
  assert.ok(out.html.includes("Your estimate is booked"), "confirmation headline");
  assert.ok(
    out.html.includes("We&#39;ll send a confirmation"),
    "confirmation message escaped + present"
  );
});

// ─── Booking-data island for the client JS ────────────────────────────

test("renderCalcomMonthV1 — emits booking-data <script type=application/json> island", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
  assert.ok(
    out.html.includes(`id="sf-booking-data"`),
    "data island has expected id"
  );
  assert.ok(
    out.html.includes(`type="application/json"`),
    "data island uses application/json type"
  );
});

test("renderCalcomMonthV1 — booking-data island contains availability + duration", () => {
  const blueprint = pickTemplate("hvac");
  const out = renderCalcomMonthV1(blueprint);
  // Pull out the JSON island and parse it.
  const m = out.html.match(/id="sf-booking-data">([^<]+)<\/script>/);
  assert.ok(m, "data island present in HTML");
  const data = JSON.parse(m![1]);
  assert.equal(data.eventType.durationMinutes, blueprint.booking.eventType.durationMinutes);
  assert.deepEqual(data.availability.weekly, blueprint.booking.availability.weekly);
  assert.equal(data.workspaceName, blueprint.workspace.name);
});

test("renderCalcomMonthV1 — escapes </script> in JSON island data (defense in depth)", () => {
  const blueprint = pickTemplate("hvac");
  // Plant a payload that would otherwise close the script tag.
  blueprint.workspace.name = `</script><img src=x onerror=alert(1)>`;
  const out = renderCalcomMonthV1(blueprint);
  // The </script> inside the JSON island must be escaped so the browser
  // doesn't treat it as a tag close. Also no raw script-close in the body.
  const islandStart = out.html.indexOf(`id="sf-booking-data"`);
  const islandEnd = out.html.indexOf(`</script>`, islandStart);
  const island = out.html.slice(islandStart, islandEnd);
  assert.ok(!island.includes("</script"), "json island must not contain raw </script");
  assert.ok(!out.html.includes("<img src=x"), "raw img tag must not appear");
});

// ─── Calendar/scheduler shell ─────────────────────────────────────────

test("renderCalcomMonthV1 — emits calendar shell with empty days grid (JS fills it)", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
  assert.ok(out.html.includes(`id="sf-cal-days"`), "days grid has id");
  assert.ok(out.html.includes(`id="sf-cal-month"`), "month label has id");
  assert.ok(/<div[^>]+id="sf-cal-days"[^>]+role="grid"[^>]*><\/div>/.test(out.html),
    "days grid is empty server-side (client JS populates)");
});

test("renderCalcomMonthV1 — emits all four scheduler panels (calendar/slots/form/confirmation)", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
  assert.ok(out.html.includes(`data-panel="calendar"`));
  assert.ok(out.html.includes(`data-panel="slots"`));
  assert.ok(out.html.includes(`data-panel="form"`));
  assert.ok(out.html.includes(`data-panel="confirmation"`));
});

test("renderCalcomMonthV1 — non-default panels are hidden initially", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
  assert.ok(/data-panel="slots"[^>]+hidden/.test(out.html), "slots hidden");
  assert.ok(/data-panel="form"[^>]+hidden/.test(out.html), "form hidden");
  assert.ok(/data-panel="confirmation"[^>]+hidden/.test(out.html), "confirmation hidden");
});

// ─── Timezone selector ────────────────────────────────────────────────

test("renderCalcomMonthV1 — emits a timezone selector in event details", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
  assert.ok(out.html.includes(`id="sf-tz-select"`), "timezone select element");
  assert.ok(out.html.includes(`Timezone`), "timezone label visible");
});

// ─── Footer parity with landing ───────────────────────────────────────

test("renderCalcomMonthV1 — footer Powered-by SeldonFrame is present (parity with landing)", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
  assert.ok(out.html.includes("Powered by"));
  assert.ok(out.html.includes("seldonframe.com"));
});
