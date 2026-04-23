// Tests for <EntityTable>. SLICE 4a PR 1 C4 per audit §2.1.
// renderToString-based smoke tests per G-4-6.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { z } from "zod";

import { EntityTable } from "../../../src/components/ui-composition/entity-table";

const ContactSchema = z.object({
  name: z.string(),
  email: z.string(),
  age: z.number(),
  isActive: z.boolean(),
});

type Contact = z.infer<typeof ContactSchema>;

const SAMPLE_ROWS: Contact[] = [
  { name: "Alice", email: "alice@example.com", age: 30, isActive: true },
  { name: "Bob", email: "bob@example.com", age: 25, isActive: false },
  { name: "Carol", email: "carol@example.com", age: 40, isActive: true },
];

describe("<EntityTable> — structural landmarks", () => {
  test("renders a <table> with thead and tbody", () => {
    const html = renderToString(
      <EntityTable schema={ContactSchema} rows={SAMPLE_ROWS} />,
    );
    assert.match(html, /<table[\s>]/);
    assert.match(html, /<thead[\s>]/);
    assert.match(html, /<tbody[\s>]/);
  });

  test("renders a column header per derived column", () => {
    const html = renderToString(
      <EntityTable schema={ContactSchema} rows={SAMPLE_ROWS} />,
    );
    assert.match(html, />Name</);
    assert.match(html, />Email</);
    assert.match(html, />Age</);
    // camelToTitle: isActive → "Is Active"
    assert.match(html, />Is Active</);
  });

  test("renders one row per entry", () => {
    const html = renderToString(
      <EntityTable schema={ContactSchema} rows={SAMPLE_ROWS} />,
    );
    assert.match(html, />Alice</);
    assert.match(html, />Bob</);
    assert.match(html, />Carol</);
    assert.match(html, />alice@example\.com</);
  });
});

describe("<EntityTable> — empty state", () => {
  test("renders an empty-state slot when rows is empty", () => {
    const html = renderToString(
      <EntityTable schema={ContactSchema} rows={[]} />,
    );
    assert.match(html, /data-entity-table-empty/);
    // Default copy:
    assert.match(html, /No records/);
  });

  test("custom emptyState prop overrides default copy", () => {
    const html = renderToString(
      <EntityTable
        schema={ContactSchema}
        rows={[]}
        emptyState={<div>Nothing to show yet — add a contact.</div>}
      />,
    );
    assert.match(html, /Nothing to show yet/);
  });
});

describe("<EntityTable> — column overrides", () => {
  test("passes through include + overrides to deriveColumns", () => {
    const html = renderToString(
      <EntityTable
        schema={ContactSchema}
        rows={SAMPLE_ROWS}
        columns={{
          include: ["name", "email"],
          overrides: { email: { title: "Contact Email" } },
        }}
      />,
    );
    assert.match(html, />Name</);
    assert.match(html, />Contact Email</);
    // 'Age' should NOT appear (not in include list)
    assert.ok(!/>\s*Age\s*</.test(html), "Age column omitted by include filter");
  });

  test("custom renderer replaces the default cell content", () => {
    const html = renderToString(
      <EntityTable
        schema={ContactSchema}
        rows={SAMPLE_ROWS}
        columns={{
          overrides: {
            isActive: {
              renderer: (v) => <span data-custom="yes">{v ? "✓" : "✗"}</span>,
            },
          },
        }}
      />,
    );
    assert.match(html, /data-custom="yes"/);
    assert.match(html, />✓</);
    assert.match(html, />✗</);
  });
});

describe("<EntityTable> — default cell rendering by type", () => {
  test("boolean values render as 'Yes'/'No' by default", () => {
    const html = renderToString(
      <EntityTable schema={ContactSchema} rows={SAMPLE_ROWS} />,
    );
    assert.match(html, />Yes</);
    assert.match(html, />No</);
  });

  test("null values render as an em-dash fallback", () => {
    const SchemaWithNull = z.object({
      name: z.string(),
      note: z.string().nullable(),
    });
    const html = renderToString(
      <EntityTable
        schema={SchemaWithNull}
        rows={[{ name: "X", note: null }]}
      />,
    );
    assert.match(html, />—</);
  });
});

describe("<EntityTable> — a11y", () => {
  test("table has an accessible label via aria-label", () => {
    const html = renderToString(
      <EntityTable
        schema={ContactSchema}
        rows={SAMPLE_ROWS}
        ariaLabel="Contacts list"
      />,
    );
    assert.match(html, /aria-label="Contacts list"/);
  });

  test("column headers use scope='col'", () => {
    const html = renderToString(
      <EntityTable schema={ContactSchema} rows={SAMPLE_ROWS} />,
    );
    assert.match(html, /<th[^>]*scope="col"/);
  });
});
