// Tests for the `## Subscriptions` parser extension in
// lib/blocks/block-md.ts (SLICE 1 PR 1 M2).
//
// Covers:
//   - parseSubscriptionsSection marker handling
//   - Malformed shapes surface via __subscriptions_malformed__
//   - Valid entries populate composition.subscriptions
//   - G-1 fully-qualified event validation via parser
//   - G-3 defaults applied (idempotency_key="{{id}}" + retry)
//   - Audit §3.4: subscribes_to events auto-populate consumes
//     with bare event name

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { parseBlockMd } from "../../src/lib/blocks/block-md";

function buildBlock(opts: { header?: string; subs?: string; consumes?: string } = {}): string {
  const header = opts.header ?? "# BLOCK: Test\n\n";
  const consumesLine = opts.consumes ? `consumes: ${opts.consumes}\n` : "";
  const subsBlock =
    opts.subs !== undefined
      ? `\n## Subscriptions\n\n<!-- SUBSCRIPTIONS:START -->\n${opts.subs}\n<!-- SUBSCRIPTIONS:END -->\n`
      : "";
  return (
    header +
    "## Composition Contract\n\n" +
    'produces: [{"event": "test.fired"}]\n' +
    consumesLine +
    "verbs: [test]\n" +
    "compose_with: [crm]\n" +
    subsBlock
  );
}

describe("parseSubscriptionsSection — marker handling", () => {
  test("returns undefined subscriptions when markers are absent", () => {
    const parsed = parseBlockMd(buildBlock());
    assert.equal(parsed.composition.subscriptions, undefined);
    assert.ok(!parsed.composition.mixedShapeFields.includes("__subscriptions_malformed__"));
  });

  test("returns empty array when markers present but body empty", () => {
    const parsed = parseBlockMd(buildBlock({ subs: "" }));
    assert.deepEqual(parsed.composition.subscriptions, []);
  });

  test("parses a single valid entry with defaults", () => {
    const subs = JSON.stringify([
      {
        event: "caldiy-booking:booking.created",
        handler: "logActivityOnBookingCreate",
      },
    ]);
    const parsed = parseBlockMd(buildBlock({ subs }));
    assert.equal(parsed.composition.subscriptions?.length, 1);
    const [sub] = parsed.composition.subscriptions!;
    assert.equal(sub.event, "caldiy-booking:booking.created");
    assert.equal(sub.handler, "logActivityOnBookingCreate");
    assert.equal(sub.idempotency_key, "{{id}}", "G-3 default applied");
    assert.equal(sub.retry.max, 3);
    assert.equal(sub.retry.backoff, "exponential");
  });

  test("parses multiple entries + custom retry/filter", () => {
    const subs = JSON.stringify([
      {
        event: "caldiy-booking:booking.created",
        handler: "onBookingCreate",
        idempotency_key: "{{data.contactId}}:{{data.appointmentId}}",
        retry: { max: 5, backoff: "linear", initial_delay_ms: 2000 },
        filter: { kind: "field_exists", field: "data.contactId" },
      },
      {
        event: "formbricks-intake:form.submitted",
        handler: "onFormSubmitted",
      },
    ]);
    const parsed = parseBlockMd(buildBlock({ subs }));
    assert.equal(parsed.composition.subscriptions?.length, 2);
    const first = parsed.composition.subscriptions![0];
    assert.equal(first.idempotency_key, "{{data.contactId}}:{{data.appointmentId}}");
    assert.equal(first.retry.max, 5);
    assert.equal(first.retry.backoff, "linear");
    assert.deepEqual(first.filter, { kind: "field_exists", field: "data.contactId" });
  });
});

describe("parseSubscriptionsSection — malformed shape handling", () => {
  test("non-JSON between markers surfaces __subscriptions_malformed__", () => {
    const parsed = parseBlockMd(buildBlock({ subs: "not valid json [}" }));
    assert.ok(parsed.composition.mixedShapeFields.includes("__subscriptions_malformed__"));
    assert.equal(parsed.composition.subscriptions, undefined);
  });

  test("non-array JSON surfaces __subscriptions_malformed__", () => {
    const parsed = parseBlockMd(buildBlock({ subs: '{"event": "x:y.z"}' }));
    assert.ok(parsed.composition.mixedShapeFields.includes("__subscriptions_malformed__"));
  });

  test("entry with unqualified event (G-1) surfaces malformed", () => {
    const subs = JSON.stringify([{ event: "booking.created", handler: "x" }]);
    const parsed = parseBlockMd(buildBlock({ subs }));
    assert.ok(parsed.composition.mixedShapeFields.includes("__subscriptions_malformed__"));
  });

  test("entry missing required handler surfaces malformed", () => {
    const subs = JSON.stringify([{ event: "crm:contact.created" }]);
    const parsed = parseBlockMd(buildBlock({ subs }));
    assert.ok(parsed.composition.mixedShapeFields.includes("__subscriptions_malformed__"));
  });

  test("retry max above ceiling (11) surfaces malformed", () => {
    const subs = JSON.stringify([
      { event: "crm:contact.created", handler: "x", retry: { max: 11 } },
    ]);
    const parsed = parseBlockMd(buildBlock({ subs }));
    assert.ok(parsed.composition.mixedShapeFields.includes("__subscriptions_malformed__"));
  });

  test("end-before-start surfaces no-op (treat as no markers)", () => {
    const blockMd =
      "# BLOCK: Test\n\n## Composition Contract\n\nproduces: [test.fired]\n" +
      "## Subscriptions\n\n<!-- SUBSCRIPTIONS:END -->\n<!-- SUBSCRIPTIONS:START -->\n";
    const parsed = parseBlockMd(blockMd);
    // End before start — defensive return is "no markers".
    assert.equal(parsed.composition.subscriptions, undefined);
    assert.ok(!parsed.composition.mixedShapeFields.includes("__subscriptions_malformed__"));
  });
});

describe("parseSubscriptionsSection — auto-populate consumes (audit §3.4)", () => {
  test("subscribes_to event auto-appends consumes {kind:'event'} with bare event name", () => {
    const subs = JSON.stringify([
      { event: "caldiy-booking:booking.created", handler: "onBookingCreate" },
    ]);
    const parsed = parseBlockMd(buildBlock({ subs }));
    const consumesTyped = parsed.composition.consumesTyped ?? [];
    const eventConsumers = consumesTyped.filter((e) => e.kind === "event");
    assert.equal(eventConsumers.length, 1);
    assert.equal(
      (eventConsumers[0] as { kind: "event"; event: string }).event,
      "booking.created",
      "bare event name (no block-slug prefix) appended to consumes",
    );
    // Also populates the flat `consumes` array for v1-compatible consumers.
    assert.ok(parsed.composition.consumes.includes("booking.created"));
  });

  test("dedupes when event already appears in consumes", () => {
    const subs = JSON.stringify([
      { event: "caldiy-booking:booking.created", handler: "onBookingCreate" },
    ]);
    // Author already wrote the consumes entry.
    const preExisting = '[{"kind": "event", "event": "booking.created"}]';
    const parsed = parseBlockMd(buildBlock({ subs, consumes: preExisting }));
    const consumesTyped = parsed.composition.consumesTyped ?? [];
    const eventConsumers = consumesTyped.filter((e) => e.kind === "event");
    assert.equal(eventConsumers.length, 1, "no duplicate — dedup applied");
  });

  test("preserves other consumes entries when auto-appending", () => {
    const subs = JSON.stringify([
      { event: "caldiy-booking:booking.created", handler: "x" },
    ]);
    const preExisting = '[{"kind": "soul_field", "soul_field": "workspace.soul.business_type", "type": "string"}]';
    const parsed = parseBlockMd(buildBlock({ subs, consumes: preExisting }));
    const consumesTyped = parsed.composition.consumesTyped ?? [];
    assert.equal(consumesTyped.length, 2, "soul_field kept + event appended");
    assert.ok(consumesTyped.some((e) => e.kind === "soul_field"));
    assert.ok(consumesTyped.some((e) => e.kind === "event"));
  });

  test("sets isV2 when subscriptions are present", () => {
    const subs = JSON.stringify([{ event: "crm:contact.created", handler: "x" }]);
    const parsed = parseBlockMd(buildBlock({ subs }));
    assert.equal(parsed.composition.isV2, true);
  });
});

describe("parseSubscriptionsSection — coexistence with TOOLS block", () => {
  test("TOOLS and SUBSCRIPTIONS markers coexist without interference", () => {
    const blockMd =
      "# BLOCK: Coexist\n\n" +
      "## Composition Contract\n\n" +
      'produces: [{"event": "test.fired"}]\n' +
      "verbs: [t]\n" +
      "compose_with: [crm]\n\n" +
      "<!-- TOOLS:START -->\n" +
      "[]\n" +
      "<!-- TOOLS:END -->\n\n" +
      "## Subscriptions\n\n" +
      "<!-- SUBSCRIPTIONS:START -->\n" +
      JSON.stringify([{ event: "crm:contact.created", handler: "x" }]) +
      "\n<!-- SUBSCRIPTIONS:END -->\n";
    const parsed = parseBlockMd(blockMd);
    assert.deepEqual(parsed.composition.tools, []);
    assert.equal(parsed.composition.subscriptions?.length, 1);
  });
});
