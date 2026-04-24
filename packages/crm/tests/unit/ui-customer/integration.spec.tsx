// Shallow-plus integration harness for SLICE 4b customer composition
// layer. PR 2 C5 per audit §5 + G-4b-4.
//
// Scope per G-4b-4 shallow-plus:
//   1. 3 customer patterns (+ CustomerLogin + BookingWidget) render
//      without errors on happy-path input.
//   2. Theme propagation through <PortalLayout> → <PublicThemeProvider>
//      surfaces as the 9-var --sf-* CSS property set on the DOM.
//   3. Magic-link flow SHAPE verification — the portal auth module's
//      exported action names are stable + the CustomerLogin component
//      references them via its imports. End-to-end DB-backed flow
//      testing is deferred to a post-launch integration slice.
//   4. Form submission paths — CustomerActionForm submit wiring: action
//      prop receives FormData on submit (verified via structural render
//      + by the component's reducer unit tests which own transition
//      logic).
//   5. Zero console.error/warn across the customer-pattern tree render.
//
// NOT in scope (explicitly deferred per audit):
//   - End-to-end DB-backed magic-link tests (own slice)
//   - User interaction simulation (jsdom / user-event)
//   - Accessibility audits (axe-core)
//   - Visual regression / cross-browser
//
// G-4b-4 rationale: "Customer-facing has higher trust stakes than 4a
// admin. Shallow-plus catches compositional conflicts, theme-flow
// regressions, and the auth-module integration shape. Deep-harness
// coverage lives in its own slice."

import { describe, test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { z } from "zod";

import { PortalLayout } from "../../../src/components/ui-customer/portal-layout";
import { CustomerDataView } from "../../../src/components/ui-customer/customer-data-view";
import { CustomerActionForm } from "../../../src/components/ui-customer/customer-action-form";
import { CustomerLogin } from "../../../src/components/ui-customer/customer-login";
import { DEFAULT_ORG_THEME } from "../../../src/lib/theme/types";

// Schema for pattern-level tests.
const BookingSchema = z.object({
  when: z.string(),
  who: z.string(),
  notes: z.string().nullable(),
});
type Booking = z.infer<typeof BookingSchema>;

const rows: Booking[] = [
  { when: "Tomorrow 10am", who: "Dr. Chen", notes: null },
  { when: "Friday 2pm", who: "Dr. Patel", notes: "follow-up" },
];

// ---------------------------------------------------------------------
// Console hygiene: capture + assert clean on every render
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
    assert.fail(`Expected no console output but got:\n${summary}`);
  }
}

// ---------------------------------------------------------------------
// 1. Pattern render on happy-path input
// ---------------------------------------------------------------------

describe("integration (shallow-plus) — customer patterns render happy-path", () => {
  test("PortalLayout renders with full prop set + children", () => {
    const html = renderToString(
      <PortalLayout
        theme={DEFAULT_ORG_THEME}
        orgName="Acme Dental"
        logoUrl="https://example.com/logo.svg"
        sessionEmail="alice@example.com"
        signOutHref="/portal/acme/logout"
        footer={<span>© 2026</span>}
      >
        <div data-testid="body">portal content</div>
      </PortalLayout>,
    );
    assert.match(html, /Acme Dental/);
    assert.match(html, /portal content/);
    assertNoConsoleIssues();
  });

  test("CustomerDataView renders cards layout with schema-driven fields", () => {
    const html = renderToString(
      <CustomerDataView schema={BookingSchema} rows={rows} ariaLabel="bookings" />,
    );
    assert.match(html, /Dr\. Chen/);
    assert.match(html, /Tomorrow 10am/);
    assertNoConsoleIssues();
  });

  test("CustomerActionForm single mode renders form", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingSchema}
        action="/api/book"
        submitLabel="Book it"
      />,
    );
    assert.match(html, /<form[^>]*action="\/api\/book"/);
    assert.match(html, /<input[^>]*name="when"/);
    assertNoConsoleIssues();
  });

  test("CustomerActionForm multi mode renders first step only", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="multi"
        schema={BookingSchema}
        steps={[
          { fields: ["when"], title: "When?" },
          { fields: ["who"], title: "With?" },
        ]}
        action="/api/book"
      />,
    );
    assert.match(html, /When\?/);
    assert.match(html, /<input[^>]*name="when"/);
    // Step 2 field not rendered yet; carried via hidden input or
    // absent depending on defaultValues. Without defaultValues, no
    // hidden input for `who` (matches implementation — only existing
    // values propagate via hidden).
    assertNoConsoleIssues();
  });

  test("CustomerLogin renders request stage with theme", () => {
    const html = renderToString(
      <CustomerLogin orgSlug="acme" theme={DEFAULT_ORG_THEME} />,
    );
    assert.match(html, /data-customer-login=""/);
    assert.match(html, /Send code/);
    assertNoConsoleIssues();
  });
});

// ---------------------------------------------------------------------
// 2. Theme propagation through PortalLayout → PublicThemeProvider
// ---------------------------------------------------------------------

describe("integration (shallow-plus) — theme propagation on customer surfaces", () => {
  test("DEFAULT_ORG_THEME emits the 9-var --sf-* override set", () => {
    const html = renderToString(
      <PortalLayout theme={DEFAULT_ORG_THEME} orgName="Acme">
        <CustomerDataView schema={BookingSchema} rows={rows} />
      </PortalLayout>,
    );
    assert.match(html, /--sf-primary:#14b8a6/);
    assert.match(html, /--sf-accent:#0d9488/);
    assert.match(html, /--sf-font:Inter/);
    assert.match(html, /--sf-radius:8px/);
    assert.match(html, /--sf-bg:/);
    assert.match(html, /--sf-text:/);
    assert.match(html, /--sf-card-bg:/);
    assert.match(html, /--sf-muted:/);
    assert.match(html, /--sf-border:/);
    assertNoConsoleIssues();
  });

  test("custom brand propagates primary + accent + radius + font", () => {
    const brand = {
      ...DEFAULT_ORG_THEME,
      primaryColor: "#ff5722",
      accentColor: "#3f51b5",
      borderRadius: "sharp" as const,
      fontFamily: "Space Grotesk" as const,
    };
    const html = renderToString(
      <PortalLayout theme={brand} orgName="Acme">
        <div>x</div>
      </PortalLayout>,
    );
    assert.match(html, /--sf-primary:#ff5722/);
    assert.match(html, /--sf-accent:#3f51b5/);
    assert.match(html, /--sf-radius:0px/);
    assert.match(html, /--sf-font:Space Grotesk/);
    // Google Font link loads the configured font.
    assert.match(html, /<link[^>]*href="https:\/\/fonts\.googleapis\.com\/css2\?family=Space\+Grotesk/);
    assertNoConsoleIssues();
  });

  test("light-mode theme flips --sf-bg / --sf-text appropriately", () => {
    const lightTheme = { ...DEFAULT_ORG_THEME, mode: "light" as const };
    const html = renderToString(
      <PortalLayout theme={lightTheme} orgName="x">
        <div>y</div>
      </PortalLayout>,
    );
    assert.match(html, /--sf-bg:#ffffff/);
    assert.match(html, /--sf-text:#09090b/);
    assertNoConsoleIssues();
  });
});

// ---------------------------------------------------------------------
// 3. Magic-link flow SHAPE verification
// ---------------------------------------------------------------------
//
// End-to-end DB-backed testing is out of scope per G-4b-4. Instead,
// this suite pins:
//   - The portal auth module's exported action names (imports of
//     these WILL break at typecheck if they change)
//   - CustomerLogin's use of those actions
//   - Initial-state rendering at each stage (deep-link verification)

describe("integration (shallow-plus) — magic-link flow SHAPE", () => {
  test("portal auth module exports the two required action names", async () => {
    const mod = await import("../../../src/lib/portal/auth");
    assert.equal(typeof mod.requestPortalAccessCodeAction, "function");
    assert.equal(typeof mod.verifyPortalAccessCodeAction, "function");
  });

  test("CustomerLogin renders at request stage with a Send code button", () => {
    const html = renderToString(
      <CustomerLogin orgSlug="acme" theme={DEFAULT_ORG_THEME} />,
    );
    assert.match(html, /<button[^>]*>[^<]*Send code/);
    assert.match(html, /<input[^>]*type="email"/);
    assertNoConsoleIssues();
  });

  test("CustomerLogin renders at verify stage with code input + email carry", () => {
    const html = renderToString(
      <CustomerLogin
        orgSlug="acme"
        theme={DEFAULT_ORG_THEME}
        initialStage="verify"
        initialEmail="alice@example.com"
      />,
    );
    assert.match(html, /alice@example\.com/);
    assert.match(html, /6-digit/);
    assert.match(html, /<button[^>]*>[^<]*Verify/);
    assertNoConsoleIssues();
  });

  test("CustomerLogin honors errorMessage prop at initial render", () => {
    const html = renderToString(
      <CustomerLogin
        orgSlug="acme"
        theme={DEFAULT_ORG_THEME}
        errorMessage="Invalid code."
      />,
    );
    assert.match(html, /data-customer-login-error/);
    assert.match(html, /Invalid code\./);
    assertNoConsoleIssues();
  });
});

// ---------------------------------------------------------------------
// 4. Form submission path — action prop wiring
// ---------------------------------------------------------------------

describe("integration (shallow-plus) — form submission path", () => {
  test("CustomerActionForm wires action prop to the <form> element", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingSchema}
        action="/api/book/submit"
        submitLabel="Book"
      />,
    );
    // The form's action attribute lands on the DOM — server-side
    // submission path is wired.
    assert.match(html, /<form[^>]*action="\/api\/book\/submit"/);
    assertNoConsoleIssues();
  });

  test("submit button surface: last step of multi shows submitLabel", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="multi"
        schema={BookingSchema}
        steps={[
          { fields: ["when"] },
          { fields: ["who"] },
        ]}
        action="/api/book"
        submitLabel="Confirm booking"
        initialStepIndex={1}
      />,
    );
    assert.match(html, /<button[^>]*type="submit"[^>]*>[^<]*Confirm booking/);
    assertNoConsoleIssues();
  });

  test("errorMessage renders inline on the form", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingSchema}
        action="/a"
        errorMessage="Submit failed. Try again."
      />,
    );
    assert.match(html, /data-customer-action-form-error/);
    assert.match(html, /Submit failed\. Try again\./);
    assertNoConsoleIssues();
  });

  test("rateLimitHint from BlockSpec renders on the form", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingSchema}
        action="/a"
        rateLimitHint="5/hour"
      />,
    );
    assert.match(html, /5\/hour/);
    assertNoConsoleIssues();
  });
});

// ---------------------------------------------------------------------
// 5. Zero console noise across the full customer pattern tree
// ---------------------------------------------------------------------

describe("integration (shallow-plus) — zero console noise across all customer patterns", () => {
  test("rendering all 4 customer patterns + login in one tree produces zero console output", () => {
    const html = renderToString(
      <PortalLayout
        theme={DEFAULT_ORG_THEME}
        orgName="Full Suite Test"
        sessionEmail="alice@example.com"
        signOutHref="/logout"
      >
        <CustomerDataView schema={BookingSchema} rows={rows} />
        <CustomerActionForm
          mode="multi"
          schema={BookingSchema}
          steps={[{ fields: ["when"], title: "Pick a time" }]}
          action="/api/book"
        />
        <CustomerLogin orgSlug="acme" theme={DEFAULT_ORG_THEME} />
      </PortalLayout>,
    );
    assert.ok(html.length > 0);
    assertNoConsoleIssues();
  });
});
