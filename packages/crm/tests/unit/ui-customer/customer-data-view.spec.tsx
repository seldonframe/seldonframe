// Tests for <CustomerDataView>. SLICE 4b PR 1 C2 per audit §5.2.
//
// Strategy: renderToString + regex assertions (G-4-6 shallow harness).
// CustomerDataView is the customer-facing analog of 4a's EntityTable
// + CompositionCard — but styled with --sf-* tokens (customer theme)
// and card-first by default (cards feel branded, tables feel
// utilitarian on customer surfaces).
//
// Pure composition (0.94x). Parent fetches data, passes rows +
// schema. Component owns rendering, empty state, and layout switch.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { z } from "zod";

import { CustomerDataView } from "../../../src/components/ui-customer/customer-data-view";

const BookingSchema = z.object({
  when: z.string(),
  with: z.string(),
  status: z.enum(["confirmed", "pending", "cancelled"]),
  notes: z.string().nullable(),
});
type Booking = z.infer<typeof BookingSchema>;

const rows: Booking[] = [
  { when: "Tomorrow 10am", with: "Dr. Chen", status: "confirmed", notes: null },
  { when: "Friday 2pm", with: "Dr. Patel", status: "pending", notes: "follow up on x-ray" },
];

describe("<CustomerDataView> — structural landmarks", () => {
  test("renders wrapper with data-customer-data-view attribute", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={rows} />,
    );
    assert.match(html, /data-customer-data-view=""/);
  });

  test("aria-label surfaces on the view wrapper", () => {
    const html = renderToString(
      <CustomerDataView
        schema={BookingSchema}
        rows={rows}
        ariaLabel="Your upcoming bookings"
      />,
    );
    assert.match(html, /aria-label="Your upcoming bookings"/);
  });
});

describe("<CustomerDataView> — empty state", () => {
  test("renders default empty state when rows is empty", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={[]} />,
    );
    assert.match(html, /data-customer-data-view-empty/);
    assert.match(html, /No data yet/);
  });

  test("renders custom empty state when provided", () => {
    const html = renderToString(
      <CustomerDataView
        schema={BookingSchema}
        rows={[]}
        emptyState={<span>No bookings yet. Book one →</span>}
      />,
    );
    assert.match(html, /No bookings yet\. Book one →/);
  });
});

describe("<CustomerDataView> — cards layout (default)", () => {
  test("renders one card per row when layout is omitted", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={rows} />,
    );
    const cardMarkers = html.match(/data-customer-data-view-card=""/g) ?? [];
    assert.equal(cardMarkers.length, 2);
  });

  test("cards expose each row's field values", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={rows} />,
    );
    assert.match(html, /Tomorrow 10am/);
    assert.match(html, /Dr\. Chen/);
    assert.match(html, /confirmed/);
    assert.match(html, /Friday 2pm/);
    assert.match(html, /Dr\. Patel/);
  });

  test("cards render field labels derived from schema keys", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={rows} />,
    );
    // camelCase → Title Case; at least one expected label present.
    assert.match(html, /Status/);
    assert.match(html, /With/);
    assert.match(html, /When/);
  });

  test("null field value renders as em-dash", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={rows} />,
    );
    // The first row has notes: null → should render "—" in the notes slot.
    assert.match(html, /—/);
  });
});

describe("<CustomerDataView> — table layout", () => {
  test("renders a <table> when layout='table'", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={rows} layout="table" />,
    );
    assert.match(html, /<table[\s>]/);
    assert.match(html, /<thead[\s>]/);
    assert.match(html, /<tbody[\s>]/);
  });

  test("table renders one <tr> per row + headers", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={rows} layout="table" />,
    );
    // tbody should contain 2 rows.
    const bodyRows = html.match(/<tr[^>]*data-customer-data-view-row/g) ?? [];
    assert.equal(bodyRows.length, 2);
  });

  test("table headers use scope='col'", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={rows} layout="table" />,
    );
    assert.match(html, /<th[^>]*scope="col"/);
  });
});

describe("<CustomerDataView> — fields prop controls subset + order", () => {
  test("fields prop limits columns to subset in given order", () => {
    const html = renderToString(
      <CustomerDataView
        schema={BookingSchema}
        rows={rows}
        fields={["with", "when"]}
      />,
    );
    // 'status' and 'notes' should not appear as labels.
    assert.ok(!html.includes("Status"));
    assert.ok(!html.includes("Notes"));
    assert.match(html, /With/);
    assert.match(html, /When/);
    // Order check: "With" must appear before "When" in rendered output.
    const idxWith = html.indexOf("With");
    const idxWhen = html.indexOf("When");
    assert.ok(idxWith < idxWhen);
  });
});

describe("<CustomerDataView> — themed styling", () => {
  test("uses --sf-* CSS variables for customer branding", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={rows} />,
    );
    // At least one inline style referencing --sf-* — the component
    // must participate in the customer theme namespace.
    assert.match(html, /var\(--sf-/);
  });
});
