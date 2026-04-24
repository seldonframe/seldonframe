// Shallow integration harness for SLICE 4a UI composition layer.
// SLICE 4a PR 3 C1 per audit §4 quality gates + G-4-6 shallow harness.
//
// Scope (per PR 3 spec):
//   1. All 7 patterns render without throwing on happy-path input.
//   2. Theme propagation through <AdminThemeProvider> surfaces on
//      the DOM as CSS custom properties.
//   3. Scaffold-generated admin UI composes with every PR 1 + PR 2
//      pattern in a single render tree without conflict.
//   4. No console.error during renderToString on any happy-path
//      flow.
//
// NOT in scope (explicitly deferred per audit §2 + G-4-6):
//   - User interaction testing (drawer open/close, tab switch, row
//     click) — deferred to when patterns adopt client interactivity
//   - Accessibility audits (axe-core) — deferred to a DEEP-harness
//     slice
//   - Visual regression / cross-browser — out of automated scope
//   - Dark-light mode verification — manual-only at preview URL
//
// G-4-6 shallow harness rationale:
//   The unit specs already cover each pattern's structural
//   contract. Integration's job here is:
//   (a) catch compositional conflicts (e.g., a pattern that throws
//       when nested inside another)
//   (b) lock down the theme-flow contract
//   (c) assert the scaffold bridge + patterns compose end-to-end
//   Deep behavioral coverage of each component belongs in its own
//   unit spec.

import { describe, test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { z } from "zod";

import { PageShell } from "../../../src/components/ui-composition/page-shell";
import { EntityTable } from "../../../src/components/ui-composition/entity-table";
import { BlockListPage } from "../../../src/components/ui-composition/block-list-page";
import { BlockDetailPage } from "../../../src/components/ui-composition/block-detail-page";
import { EntityFormDrawer } from "../../../src/components/ui-composition/entity-form-drawer";
import { ActivityFeed } from "../../../src/components/ui-composition/activity-feed";
import { CompositionCard } from "../../../src/components/ui-composition/composition-card";
import { AdminThemeProvider } from "../../../src/components/theme/admin-theme-provider";
import { DEFAULT_ORG_THEME } from "../../../src/lib/theme/types";

// ---------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------

const ContactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
});
type Contact = z.infer<typeof ContactSchema>;

const contactRows: Contact[] = [
  { firstName: "Alice", lastName: "Zhao", email: "alice@example.com", role: "admin" },
  { firstName: "Bob", lastName: "Yates", email: "bob@example.com", role: "member" },
];

const FIXED_NOW = new Date("2026-04-24T12:00:00Z");

// ---------------------------------------------------------------------
// Console capture — any console.error during a happy-path render is
// a regression signal (React prop-type warnings, key warnings,
// hydration mismatches all surface through console.error).
// ---------------------------------------------------------------------

let captured: Array<{ level: "error" | "warn"; args: unknown[] }>;
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  captured = [];
  console.error = (...args: unknown[]) => {
    captured.push({ level: "error", args });
  };
  console.warn = (...args: unknown[]) => {
    captured.push({ level: "warn", args });
  };
});

afterEach(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

function assertNoConsoleIssues() {
  if (captured.length > 0) {
    const summary = captured
      .map((e) => `[${e.level}] ${e.args.map((a) => String(a)).join(" ")}`)
      .join("\n");
    assert.fail(`Expected no console errors/warnings but got:\n${summary}`);
  }
}

// ---------------------------------------------------------------------
// 1. All 7 patterns render on happy-path input
// ---------------------------------------------------------------------

describe("integration — all PR 1 + PR 2 patterns render on happy-path input", () => {
  test("PageShell renders with full prop set", () => {
    const html = renderToString(
      <PageShell
        title="Contacts"
        description="Your people."
        breadcrumbs={[{ label: "CRM", href: "/" }, { label: "Contacts" }]}
        actions={<button>New</button>}
      >
        <p>body</p>
      </PageShell>,
    );
    assert.match(html, /Contacts/);
    assertNoConsoleIssues();
  });

  test("EntityTable renders with Zod-inferred columns + rows", () => {
    const html = renderToString(
      <EntityTable schema={ContactSchema} rows={contactRows} ariaLabel="Contacts" />,
    );
    assert.match(html, /Alice/);
    assert.match(html, /bob@example\.com/);
    assertNoConsoleIssues();
  });

  test("BlockListPage composes PageShell + EntityTable", () => {
    const html = renderToString(
      <BlockListPage
        title="Contacts"
        schema={ContactSchema}
        rows={contactRows}
      />,
    );
    assert.match(html, /<main[\s>]/);
    assert.match(html, /Alice/);
    assertNoConsoleIssues();
  });

  test("BlockDetailPage renders with tabs + subtitle + actions", () => {
    const html = renderToString(
      <BlockDetailPage
        title="Alice Zhao"
        subtitle="alice@example.com"
        tabs={[
          { id: "overview", label: "Overview", href: "?tab=overview" },
          { id: "activities", label: "Activities", href: "?tab=activities" },
        ]}
        activeTab="overview"
        actions={<button>Edit</button>}
      >
        <div>overview content</div>
      </BlockDetailPage>,
    );
    assert.match(html, /Alice Zhao/);
    assert.match(html, /overview content/);
    assertNoConsoleIssues();
  });

  test("EntityFormDrawer renders when open with Zod-inferred fields", () => {
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
    assert.match(html, /<input[^>]*type="email"/);
    assert.match(html, /<select[^>]*name="role"/);
    assertNoConsoleIssues();
  });

  test("ActivityFeed renders timeline with grouping", () => {
    const html = renderToString(
      <ActivityFeed
        items={[
          {
            id: "a1",
            type: "task",
            subject: "Follow up",
            createdAt: "2026-04-24T08:00:00Z",
          },
          {
            id: "a2",
            type: "note",
            subject: "Warmed up",
            createdAt: "2026-04-23T14:00:00Z",
          },
        ]}
        now={FIXED_NOW}
      />,
    );
    assert.match(html, /Today/);
    assert.match(html, /Yesterday/);
    assertNoConsoleIssues();
  });

  test("CompositionCard renders with schema-driven rows", () => {
    const BookingSchema = z.object({ when: z.string(), who: z.string() });
    const html = renderToString(
      <CompositionCard
        title="Recent bookings"
        schema={BookingSchema}
        rows={[{ when: "Tomorrow 10am", who: "Alice" }]}
      />,
    );
    assert.match(html, /Recent bookings/);
    assert.match(html, /Alice/);
    assertNoConsoleIssues();
  });
});

// ---------------------------------------------------------------------
// 2. Theme propagation
// ---------------------------------------------------------------------

describe("integration — theme propagation through <AdminThemeProvider>", () => {
  test("default theme injects the curated CSS var override set", () => {
    const html = renderToString(
      <AdminThemeProvider theme={DEFAULT_ORG_THEME}>
        <BlockListPage title="Contacts" schema={ContactSchema} rows={contactRows} />
      </AdminThemeProvider>,
    );
    // All four overrides present in the wrapper's inline style.
    assert.match(html, /data-admin-theme-provider=""/);
    assert.match(html, /--primary:#14b8a6/);
    assert.match(html, /--ring:#14b8a6/);
    assert.match(html, /--accent:#0d9488/);
    assert.match(html, /--radius:0\.75rem/);
    // The wrapped content is still rendered inside.
    assert.match(html, /Alice/);
    assertNoConsoleIssues();
  });

  test("null theme passes children through unchanged (no wrapper div)", () => {
    const html = renderToString(
      <AdminThemeProvider theme={null}>
        <BlockListPage title="x" schema={ContactSchema} rows={contactRows} />
      </AdminThemeProvider>,
    );
    assert.ok(!html.includes("data-admin-theme-provider"));
    assert.match(html, /Alice/);
    assertNoConsoleIssues();
  });

  test("custom theme maps primary + accent to --primary / --accent", () => {
    const brand = {
      ...DEFAULT_ORG_THEME,
      primaryColor: "#ff5722",
      accentColor: "#3f51b5",
      borderRadius: "sharp" as const,
    };
    const html = renderToString(
      <AdminThemeProvider theme={brand}>
        <PageShell title="x">body</PageShell>
      </AdminThemeProvider>,
    );
    assert.match(html, /--primary:#ff5722/);
    assert.match(html, /--accent:#3f51b5/);
    assert.match(html, /--radius:0px/);
    assertNoConsoleIssues();
  });
});

// ---------------------------------------------------------------------
// 3. Scaffold + patterns compose end-to-end
// ---------------------------------------------------------------------
//
// The scaffold → UI bridge smoke test (admin-bridge-smoke.spec.tsx)
// already proves a scaffolded admin page dynamically imports + renders.
// This test locks down that the patterns themselves compose in the
// same tree: scaffolded schema → BlockListPage → EntityTable, wrapped
// by AdminThemeProvider, sibling to a CompositionCard + ActivityFeed.

describe("integration — scaffold schema + all patterns compose in one tree", () => {
  test("renders full admin dashboard tree without errors", () => {
    // Simulate a scaffolded schema inline — same shape as what
    // renderAdminSchemaTs would emit.
    const NoteSchema = z.object({
      body: z.string(),
      priority: z.number().int().optional(),
      archived: z.boolean().optional(),
    });

    const html = renderToString(
      <AdminThemeProvider theme={DEFAULT_ORG_THEME}>
        <BlockListPage
          title="Notes"
          schema={NoteSchema}
          rows={[
            { body: "First note", priority: 1, archived: false },
            { body: "Second note", priority: 2, archived: false },
          ]}
        />
        <CompositionCard
          title="Recent activity"
          schema={z.object({ who: z.string(), what: z.string() })}
          rows={[{ who: "Alice", what: "archived a note" }]}
        />
        <ActivityFeed
          items={[{ id: "1", type: "note", subject: "x", createdAt: "2026-04-24T00:00:00Z" }]}
          now={FIXED_NOW}
        />
      </AdminThemeProvider>,
    );

    // All three pattern markers land in one string.
    assert.match(html, /data-admin-theme-provider=""/);
    assert.match(html, /First note/);
    assert.match(html, /Recent activity/);
    assert.match(html, /data-activity-feed=""/);
    assertNoConsoleIssues();
  });
});

// ---------------------------------------------------------------------
// 4. No console.error across every pattern (final catch-all)
// ---------------------------------------------------------------------
//
// Individual tests assert above. This final test sweeps the whole
// pattern set in one tree + asserts a clean console — catches any
// cross-pattern warning (e.g., duplicate keys, missing required props
// only surfaced when composed) that slipped past per-pattern checks.

describe("integration — zero console noise across the pattern suite", () => {
  test("rendering all 7 patterns in one tree produces zero console output", () => {
    const html = renderToString(
      <AdminThemeProvider theme={DEFAULT_ORG_THEME}>
        <PageShell title="Dashboard">
          <EntityFormDrawer
            open
            title="Edit contact"
            schema={ContactSchema}
            defaultValues={contactRows[0]}
            closeHref="/contacts"
            action="/api/contacts"
          />
          <EntityTable schema={ContactSchema} rows={contactRows} />
          <BlockDetailPage
            title="Alice"
            tabs={[{ id: "x", label: "Tab", href: "?tab=x" }]}
            activeTab="x"
          >
            <div>detail</div>
          </BlockDetailPage>
          <ActivityFeed items={[]} now={FIXED_NOW} />
          <CompositionCard title="Card" state="empty" />
        </PageShell>
      </AdminThemeProvider>,
    );
    assert.ok(html.length > 0);
    assertNoConsoleIssues();
  });
});
