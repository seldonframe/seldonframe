// Tests for <EntityFormDrawer>. SLICE 4a PR 2 C2 per audit §2.1.
//
// Strategy: renderToString + regex assertions (G-4-6). Drawer is a
// server component (no client JS). URL-driven open/close via the
// `open` prop; parent computes from searchParams.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { z } from "zod";

import { EntityFormDrawer } from "../../../src/components/ui-composition/entity-form-drawer";

const ContactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
  active: z.boolean().default(true),
  age: z.number().optional(),
});

describe("<EntityFormDrawer> — visibility", () => {
  test("renders nothing visible when open=false", () => {
    const html = renderToString(
      <EntityFormDrawer
        open={false}
        title="New Contact"
        schema={ContactSchema}
        closeHref="/contacts"
        action="/api/contacts"
      />,
    );
    // Either empty string or a hidden structure. No form element.
    assert.ok(!html.includes("<form"));
  });

  test("renders drawer + form when open=true", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="New Contact"
        schema={ContactSchema}
        closeHref="/contacts"
        action="/api/contacts"
      />,
    );
    assert.match(html, /<form[^>]*action="\/api\/contacts"/);
    assert.match(html, /data-entity-form-drawer=""/);
    assert.match(html, /New Contact/);
  });
});

describe("<EntityFormDrawer> — landmarks + a11y", () => {
  test("drawer has role=dialog + aria-label from title", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="New Contact"
        schema={ContactSchema}
        closeHref="/contacts"
        action="/api/contacts"
      />,
    );
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-label="New Contact"/);
  });

  test("close link navigates to closeHref", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={ContactSchema}
        closeHref="/contacts"
        action="/api/contacts"
      />,
    );
    assert.match(html, /data-entity-form-close/);
    assert.match(html, /href="\/contacts"/);
  });
});

describe("<EntityFormDrawer> — field rendering from schema", () => {
  test("renders text input for ZodString", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ name: z.string() })}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<input[^>]*type="text"[^>]*name="name"/);
  });

  test("renders email input for z.string().email()", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ email: z.string().email() })}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<input[^>]*type="email"[^>]*name="email"/);
  });

  test("renders number input for ZodNumber", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ age: z.number() })}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<input[^>]*type="number"[^>]*name="age"/);
  });

  test("renders checkbox for ZodBoolean", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ active: z.boolean() })}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<input[^>]*type="checkbox"[^>]*name="active"/);
  });

  test("renders <select> with options for ZodEnum", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ role: z.enum(["admin", "member"]) })}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<select[^>]*name="role"/);
    assert.match(html, /<option[^>]*value="admin"/);
    assert.match(html, /<option[^>]*value="member"/);
  });

  test("renders date input for ZodDate", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ joinedAt: z.date() })}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<input[^>]*type="date"[^>]*name="joinedAt"/);
  });

  test("textarea widget (via override)", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ notes: z.string() })}
        fields={{ notes: { widget: "textarea" } }}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<textarea[^>]*name="notes"/);
  });
});

describe("<EntityFormDrawer> — labels + required markers", () => {
  test("camelCase key → Title Case label", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ firstName: z.string() })}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /First Name/);
  });

  test("required field has required attr on input", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ name: z.string() })}
        closeHref="/x"
        action="/a"
      />,
    );
    const match = html.match(/<input[^>]*name="name"[^>]*>/);
    assert.ok(match, "expected name input");
    assert.match(match![0], /required/);
  });

  test("optional field has no required attr", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ nickname: z.string().optional() })}
        closeHref="/x"
        action="/a"
      />,
    );
    const match = html.match(/<input[^>]*name="nickname"[^>]*>/);
    assert.ok(match, "expected nickname input");
    assert.ok(!match![0].includes("required"), "nickname must not be required");
  });
});

describe("<EntityFormDrawer> — defaults + initial values", () => {
  test(".default(x) populates the input value", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ active: z.boolean().default(true) })}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<input[^>]*type="checkbox"[^>]*checked/);
  });

  test("defaultValues prop overrides schema defaults", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ name: z.string() })}
        defaultValues={{ name: "Alice" }}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<input[^>]*name="name"[^>]*value="Alice"/);
  });

  test("defaultValues covers select (enum) initial value", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ role: z.enum(["admin", "member"]) })}
        defaultValues={{ role: "member" }}
        closeHref="/x"
        action="/a"
      />,
    );
    // Look for the member option flagged selected.
    const memberOptionMatch = html.match(/<option[^>]*value="member"[^>]*>/);
    assert.ok(memberOptionMatch, "expected member option");
    assert.match(memberOptionMatch![0], /selected/);
  });
});

describe("<EntityFormDrawer> — submit button", () => {
  test("renders submit button with default label", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ name: z.string() })}
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<button[^>]*type="submit"[^>]*>[^<]*(Save|Submit)/);
  });

  test("submitLabel customises the button text", () => {
    const html = renderToString(
      <EntityFormDrawer
        open
        title="x"
        schema={z.object({ name: z.string() })}
        submitLabel="Create contact"
        closeHref="/x"
        action="/a"
      />,
    );
    assert.match(html, /<button[^>]*type="submit"[^>]*>[^<]*Create contact/);
  });
});
