// Tests for <CompositionCard>. SLICE 4a PR 2 C4 per audit §2.1.
//
// Covers: baseline card chrome (title/subtitle/href/children),
// explicit error states (unavailable / error / empty),
// schema+rows rendering with Zod validation, and field ordering.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { z } from "zod";

import { CompositionCard } from "../../../src/components/ui-composition/composition-card";

const BookingSchema = z.object({
  when: z.string(),
  who: z.string(),
  confirmed: z.boolean(),
});

describe("<CompositionCard> — baseline chrome", () => {
  test("renders card wrapper with data-composition-card", () => {
    const html = renderToString(
      <CompositionCard title="Recent bookings">
        <p>body</p>
      </CompositionCard>,
    );
    assert.match(html, /data-composition-card=""/);
  });

  test("renders title", () => {
    const html = renderToString(
      <CompositionCard title="Recent bookings">
        <p>body</p>
      </CompositionCard>,
    );
    assert.match(html, /Recent bookings/);
  });

  test("renders subtitle when provided", () => {
    const html = renderToString(
      <CompositionCard title="x" subtitle="From the Bookings block">
        <p>body</p>
      </CompositionCard>,
    );
    assert.match(html, /data-composition-card-subtitle/);
    assert.match(html, /From the Bookings block/);
  });

  test("omits subtitle element when absent", () => {
    const html = renderToString(
      <CompositionCard title="x">
        <p>body</p>
      </CompositionCard>,
    );
    assert.ok(!html.includes("data-composition-card-subtitle"));
  });

  test("renders children in body", () => {
    const html = renderToString(
      <CompositionCard title="x">
        <p data-testid="body-content">body text</p>
      </CompositionCard>,
    );
    assert.match(html, /data-testid="body-content"/);
    assert.match(html, />body text</);
  });

  test("href renders View all link", () => {
    const html = renderToString(
      <CompositionCard title="x" href="/bookings">
        <p>body</p>
      </CompositionCard>,
    );
    assert.match(html, /data-composition-card-href/);
    assert.match(html, /href="\/bookings"/);
    assert.match(html, /View all/);
  });

  test("aria-label surfaces from title", () => {
    const html = renderToString(
      <CompositionCard title="Recent bookings">
        <p>body</p>
      </CompositionCard>,
    );
    assert.match(html, /aria-label="Recent bookings"/);
  });
});

describe("<CompositionCard> — explicit state: unavailable", () => {
  test("unavailable state renders default message", () => {
    const html = renderToString(
      <CompositionCard title="Bookings" state="unavailable">
        <p>body (should not render)</p>
      </CompositionCard>,
    );
    assert.match(html, /data-composition-card-unavailable/);
    assert.match(html, /not installed|unavailable|install/i);
    assert.ok(!html.includes("body (should not render)"));
  });

  test("unavailable state with override message", () => {
    const html = renderToString(
      <CompositionCard
        title="Bookings"
        state="unavailable"
        unavailableMessage="Install the Bookings block to see this"
      >
        <p>body</p>
      </CompositionCard>,
    );
    assert.match(html, /Install the Bookings block to see this/);
  });
});

describe("<CompositionCard> — explicit state: error", () => {
  test("error state renders default message", () => {
    const html = renderToString(
      <CompositionCard title="Bookings" state="error">
        <p>body (should not render)</p>
      </CompositionCard>,
    );
    assert.match(html, /data-composition-card-error/);
    assert.match(html, /Failed|error|Couldn/i);
    assert.ok(!html.includes("body (should not render)"));
  });

  test("error state with override message", () => {
    const html = renderToString(
      <CompositionCard title="x" state="error" errorMessage="Network timeout">
        <p>body</p>
      </CompositionCard>,
    );
    assert.match(html, /Network timeout/);
  });
});

describe("<CompositionCard> — explicit state: empty", () => {
  test("empty state renders default", () => {
    const html = renderToString(
      <CompositionCard title="Bookings" state="empty">
        <p>body (should not render)</p>
      </CompositionCard>,
    );
    assert.match(html, /data-composition-card-empty/);
    assert.ok(!html.includes("body (should not render)"));
  });

  test("empty state override", () => {
    const html = renderToString(
      <CompositionCard
        title="Bookings"
        state="empty"
        emptyState={<span>No bookings scheduled.</span>}
      >
        <p>body</p>
      </CompositionCard>,
    );
    assert.match(html, /No bookings scheduled\./);
  });
});

describe("<CompositionCard> — schema + rows rendering", () => {
  test("renders valid rows as labeled entries", () => {
    const html = renderToString(
      <CompositionCard
        title="Bookings"
        schema={BookingSchema}
        rows={[
          { when: "Tomorrow 10am", who: "Alice", confirmed: true },
          { when: "Friday 2pm", who: "Bob", confirmed: false },
        ]}
      />,
    );
    assert.match(html, /Tomorrow 10am/);
    assert.match(html, /Alice/);
    assert.match(html, /Friday 2pm/);
    assert.match(html, /Bob/);
  });

  test("silently drops a row that fails schema validation", () => {
    const html = renderToString(
      <CompositionCard
        title="Bookings"
        schema={BookingSchema}
        rows={[
          { when: "Tomorrow 10am", who: "Alice", confirmed: true },
          // Invalid — missing `confirmed`.
          { when: "Friday 2pm", who: "Bob" } as unknown as z.infer<typeof BookingSchema>,
        ]}
      />,
    );
    assert.match(html, /Alice/);
    assert.ok(!html.includes("Bob"), "invalid row should be silently dropped");
  });

  test("falls back to empty state when every row is invalid", () => {
    const html = renderToString(
      <CompositionCard
        title="Bookings"
        schema={BookingSchema}
        rows={[
          { when: "Friday 2pm", who: "Bob" } as unknown as z.infer<typeof BookingSchema>,
        ]}
      />,
    );
    assert.match(html, /data-composition-card-empty/);
  });

  test("fields prop controls which keys render + order", () => {
    const html = renderToString(
      <CompositionCard
        title="Bookings"
        schema={BookingSchema}
        rows={[{ when: "Tomorrow 10am", who: "Alice", confirmed: true }]}
        fields={["who", "when"]}
      />,
    );
    // Rendering should include who + when, not confirmed.
    assert.match(html, /Alice/);
    assert.match(html, /Tomorrow 10am/);
    // Check order: "Alice" appears before "Tomorrow 10am" in the output.
    const idxWho = html.indexOf("Alice");
    const idxWhen = html.indexOf("Tomorrow 10am");
    assert.ok(idxWho > -1 && idxWhen > -1);
    assert.ok(idxWho < idxWhen, "fields order should control render order");
  });

  test("limits rows to default maxRows and surfaces +N more", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      when: `Slot ${i}`,
      who: `Person ${i}`,
      confirmed: true,
    }));
    const html = renderToString(
      <CompositionCard
        title="Bookings"
        schema={BookingSchema}
        rows={rows}
      />,
    );
    // Default maxRows=5 means 3 additional → "+3 more".
    assert.match(html, /\+3 more|\+3 More/);
    // Person 0..4 should render; Person 5..7 should not.
    assert.match(html, /Person 0/);
    assert.match(html, /Person 4/);
    assert.ok(!html.includes("Person 5"));
  });

  test("maxRows override controls limit", () => {
    const rows = [
      { when: "a", who: "Alpha", confirmed: true },
      { when: "b", who: "Beta", confirmed: true },
      { when: "c", who: "Gamma", confirmed: true },
    ];
    const html = renderToString(
      <CompositionCard
        title="Bookings"
        schema={BookingSchema}
        rows={rows}
        maxRows={2}
      />,
    );
    assert.match(html, /Alpha/);
    assert.match(html, /Beta/);
    assert.ok(!html.includes("Gamma"));
    assert.match(html, /\+1 more/);
  });
});
