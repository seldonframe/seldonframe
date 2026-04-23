// Tests for <BlockListPage>. SLICE 4a PR 1 C4 per audit §2.1.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { z } from "zod";

import { BlockListPage } from "../../../src/components/ui-composition/block-list-page";

const ContactSchema = z.object({
  name: z.string(),
  email: z.string(),
});
type Contact = z.infer<typeof ContactSchema>;

const SAMPLE_ROWS: Contact[] = [
  { name: "Alice", email: "alice@example.com" },
  { name: "Bob", email: "bob@example.com" },
];

describe("<BlockListPage> — composes PageShell + EntityTable", () => {
  test("renders page title from props", () => {
    const html = renderToString(
      <BlockListPage
        title="Contacts"
        schema={ContactSchema}
        rows={SAMPLE_ROWS}
      />,
    );
    assert.match(html, />Contacts</);
    assert.match(html, /<h1[^>]*>/);
  });

  test("renders the table with derived columns + rows", () => {
    const html = renderToString(
      <BlockListPage
        title="Contacts"
        schema={ContactSchema}
        rows={SAMPLE_ROWS}
      />,
    );
    assert.match(html, /<table[\s>]/);
    assert.match(html, />Name</);
    assert.match(html, />Email</);
    assert.match(html, />Alice</);
    assert.match(html, />Bob</);
  });

  test("renders description + actions when provided", () => {
    const html = renderToString(
      <BlockListPage
        title="Contacts"
        description="All your contacts."
        actions={<button>New contact</button>}
        schema={ContactSchema}
        rows={SAMPLE_ROWS}
      />,
    );
    assert.match(html, /All your contacts\./);
    assert.match(html, /<button[^>]*>New contact<\/button>/);
  });

  test("forwards columns override to EntityTable", () => {
    const html = renderToString(
      <BlockListPage
        title="Contacts"
        schema={ContactSchema}
        rows={SAMPLE_ROWS}
        columns={{ include: ["name"] }}
      />,
    );
    assert.match(html, />Name</);
    assert.ok(!/>\s*Email\s*</.test(html), "Email column omitted by include filter");
  });

  test("empty rows → shows empty state inside page shell", () => {
    const html = renderToString(
      <BlockListPage title="Contacts" schema={ContactSchema} rows={[]} />,
    );
    assert.match(html, /data-entity-table-empty/);
    assert.match(html, /No records/);
  });
});

describe("<BlockListPage> — breadcrumbs forwarded", () => {
  test("breadcrumbs prop lands in the page shell", () => {
    const html = renderToString(
      <BlockListPage
        title="Contacts"
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Contacts" }]}
        schema={ContactSchema}
        rows={SAMPLE_ROWS}
      />,
    );
    assert.match(html, /data-page-shell-breadcrumbs/);
    assert.match(html, />Home</);
    assert.match(html, />Contacts</);
  });
});
