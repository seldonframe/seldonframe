// Tests for <CustomerActionForm>. SLICE 4b PR 1 C3 per audit §5.3.
//
// State-machine component (L-17 1.8x). Two modes:
//   - single: flat form, all fields at once, submit button
//   - multi:  progressive disclosure, steps[{fields, title}],
//             internal state tracks current step, accumulated
//             answers, submission pending, error
//
// Test strategy: renderToString + regex for initial-render
// assertions across (a) single mode, (b) multi mode at various
// initial step indices. For state-transition logic, the reducer
// is extracted as a pure function + unit-tested directly.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { z } from "zod";

import {
  CustomerActionForm,
  customerActionFormReducer,
  initialCustomerActionFormState,
  type CustomerActionFormState,
  type CustomerActionFormAction,
  type CustomerActionFormStep,
} from "../../../src/components/ui-customer/customer-action-form";

const BookingDetailsSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

const IntakeSchema = z.object({
  name: z.string(),
  reason: z.enum(["pain", "cleaning", "consult"]),
  priority: z.number().int().optional(),
});

// ---------------------------------------------------------------------
// Single-mode rendering
// ---------------------------------------------------------------------

describe("<CustomerActionForm> — single mode", () => {
  test("renders a <form> with all schema-derived fields", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingDetailsSchema}
        action="/api/book"
        submitLabel="Confirm"
      />,
    );
    assert.match(html, /<form[^>]*action="\/api\/book"/);
    assert.match(html, /<input[^>]*name="firstName"/);
    assert.match(html, /<input[^>]*name="lastName"/);
    assert.match(html, /<input[^>]*type="email"[^>]*name="email"/);
  });

  test("renders submit button with custom label", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingDetailsSchema}
        action="/a"
        submitLabel="Book my appointment"
      />,
    );
    assert.match(html, /<button[^>]*type="submit"[^>]*>[^<]*Book my appointment/);
  });

  test("default submitLabel is 'Submit' when not provided", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingDetailsSchema}
        action="/a"
      />,
    );
    assert.match(html, /<button[^>]*type="submit"[^>]*>[^<]*Submit/);
  });

  test("defaultValues populate input values", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingDetailsSchema}
        action="/a"
        defaultValues={{ firstName: "Alice", lastName: "Zhao" }}
      />,
    );
    const firstMatch = html.match(/<input[^>]*name="firstName"[^>]*>/);
    assert.ok(firstMatch);
    assert.match(firstMatch![0], /value="Alice"/);
  });

  test("required fields carry required attr; optional do not", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingDetailsSchema}
        action="/a"
      />,
    );
    const firstName = html.match(/<input[^>]*name="firstName"[^>]*>/);
    const phone = html.match(/<input[^>]*name="phone"[^>]*>/);
    assert.ok(firstName && phone);
    assert.match(firstName![0], /required/);
    assert.ok(!phone![0].includes("required"));
  });

  test("ZodEnum renders a <select> with options", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={IntakeSchema}
        action="/a"
      />,
    );
    assert.match(html, /<select[^>]*name="reason"/);
    assert.match(html, /<option[^>]*value="pain"/);
    assert.match(html, /<option[^>]*value="cleaning"/);
    assert.match(html, /<option[^>]*value="consult"/);
  });

  test("ZodNumber renders number input", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={IntakeSchema}
        action="/a"
      />,
    );
    assert.match(html, /<input[^>]*type="number"[^>]*name="priority"/);
  });

  test("customer theming uses --sf-* CSS variables", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingDetailsSchema}
        action="/a"
      />,
    );
    assert.match(html, /var\(--sf-/);
  });
});

// ---------------------------------------------------------------------
// Multi-mode initial rendering
// ---------------------------------------------------------------------

describe("<CustomerActionForm> — multi mode initial state", () => {
  type BookingKeys = keyof z.infer<typeof BookingDetailsSchema>;
  const multiSteps: CustomerActionFormStep<BookingKeys>[] = [
    { fields: ["firstName", "lastName"], title: "About you" },
    { fields: ["email", "phone"], title: "Contact" },
    { fields: ["notes"], title: "Anything else?" },
  ];

  test("renders first step's fields only on initial render", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="multi"
        schema={BookingDetailsSchema}
        steps={multiSteps}
        action="/a"
      />,
    );
    assert.match(html, /<input[^>]*name="firstName"/);
    assert.match(html, /<input[^>]*name="lastName"/);
    assert.ok(!html.match(/<input[^>]*name="email"/));
    assert.ok(!html.match(/<input[^>]*name="phone"/));
  });

  test("renders current step title", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="multi"
        schema={BookingDetailsSchema}
        steps={multiSteps}
        action="/a"
      />,
    );
    assert.match(html, /About you/);
  });

  test("renders step progress indicator", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="multi"
        schema={BookingDetailsSchema}
        steps={multiSteps}
        action="/a"
      />,
    );
    assert.match(html, /Step 1 of 3/);
  });

  test("first step shows Next button, no Back", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="multi"
        schema={BookingDetailsSchema}
        steps={multiSteps}
        action="/a"
      />,
    );
    assert.match(html, /<button[^>]*>[^<]*Next/);
    assert.ok(!html.match(/<button[^>]*>[^<]*Back/));
  });

  test("middle step (initialStepIndex=1) shows both Back and Next", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="multi"
        schema={BookingDetailsSchema}
        steps={multiSteps}
        action="/a"
        initialStepIndex={1}
      />,
    );
    assert.match(html, /<button[^>]*>[^<]*Back/);
    assert.match(html, /<button[^>]*>[^<]*Next/);
  });

  test("last step (initialStepIndex=N-1) shows Back + Submit, no Next", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="multi"
        schema={BookingDetailsSchema}
        steps={multiSteps}
        action="/a"
        initialStepIndex={2}
        submitLabel="Confirm booking"
      />,
    );
    assert.match(html, /<button[^>]*>[^<]*Back/);
    assert.match(html, /<button[^>]*type="submit"[^>]*>[^<]*Confirm booking/);
    assert.ok(!html.match(/>Next</));
  });

  test("last step progress reflects correct index", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="multi"
        schema={BookingDetailsSchema}
        steps={multiSteps}
        action="/a"
        initialStepIndex={2}
      />,
    );
    assert.match(html, /Step 3 of 3/);
  });

  test("defaultValues carry through across all steps' fields", () => {
    type Booking = z.infer<typeof BookingDetailsSchema>;
    const html = renderToString(
      <CustomerActionForm<Booking>
        mode="multi"
        schema={BookingDetailsSchema}
        steps={multiSteps}
        action="/a"
        initialStepIndex={1}
        defaultValues={{ firstName: "Alice", email: "alice@example.com" }}
      />,
    );
    // On step 1 only email field is visible; firstName is carried via
    // hidden input to survive submit.
    const emailMatch = html.match(/<input[^>]*name="email"[^>]*>/);
    assert.ok(emailMatch);
    assert.match(emailMatch![0], /value="alice@example\.com"/);
    // firstName not visible on step 1 but preserved via hidden input.
    assert.match(html, /<input[^>]*type="hidden"[^>]*name="firstName"[^>]*value="Alice"/);
  });
});

// ---------------------------------------------------------------------
// Reducer — pure state-transition logic
// ---------------------------------------------------------------------

describe("customerActionFormReducer — state transitions", () => {
  const initial: CustomerActionFormState = initialCustomerActionFormState({
    totalSteps: 3,
    defaultValues: { firstName: "A" },
  });

  test("next advances step when not at last", () => {
    const next = customerActionFormReducer(initial, { type: "next" });
    assert.equal(next.stepIndex, 1);
  });

  test("next does not advance past the last step", () => {
    const atLast: CustomerActionFormState = { ...initial, stepIndex: 2 };
    const next = customerActionFormReducer(atLast, { type: "next" });
    assert.equal(next.stepIndex, 2);
  });

  test("back retreats step when not at first", () => {
    const mid: CustomerActionFormState = { ...initial, stepIndex: 2 };
    const prev = customerActionFormReducer(mid, { type: "back" });
    assert.equal(prev.stepIndex, 1);
  });

  test("back does not retreat below 0", () => {
    const prev = customerActionFormReducer(initial, { type: "back" });
    assert.equal(prev.stepIndex, 0);
  });

  test("setAnswer updates a single field", () => {
    const next = customerActionFormReducer(
      initial,
      { type: "setAnswer", key: "email", value: "x@y.com" },
    );
    assert.equal(next.answers.email, "x@y.com");
    // Existing values preserved.
    assert.equal(next.answers.firstName, "A");
  });

  test("setPending toggles submission-in-flight flag", () => {
    const pending = customerActionFormReducer(initial, { type: "setPending", pending: true });
    assert.equal(pending.pending, true);
    const resolved = customerActionFormReducer(pending, { type: "setPending", pending: false });
    assert.equal(resolved.pending, false);
  });

  test("setError records + clears error message", () => {
    const errored = customerActionFormReducer(initial, { type: "setError", error: "Network down" });
    assert.equal(errored.error, "Network down");
    const cleared = customerActionFormReducer(errored, { type: "setError", error: null });
    assert.equal(cleared.error, null);
  });

  test("initialCustomerActionFormState accepts initialStepIndex override", () => {
    const state = initialCustomerActionFormState({ totalSteps: 3, initialStepIndex: 2 });
    assert.equal(state.stepIndex, 2);
  });

  test("unknown action type returns state unchanged (safety default)", () => {
    const unchanged = customerActionFormReducer(
      initial,
      { type: "__unknown__" } as unknown as CustomerActionFormAction,
    );
    assert.equal(unchanged, initial);
  });
});

// ---------------------------------------------------------------------
// Error state rendering (props-driven)
// ---------------------------------------------------------------------

describe("<CustomerActionForm> — error rendering", () => {
  test("errorMessage prop surfaces as a visible alert", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingDetailsSchema}
        action="/a"
        errorMessage="Email is required."
      />,
    );
    assert.match(html, /data-customer-action-form-error/);
    assert.match(html, /Email is required\./);
  });

  test("no error markup when errorMessage absent", () => {
    const html = renderToString(
      <CustomerActionForm
        mode="single"
        schema={BookingDetailsSchema}
        action="/a"
      />,
    );
    assert.ok(!html.includes("data-customer-action-form-error"));
  });
});
