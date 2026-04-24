// <CustomerActionForm> — themed form primitive for customer
// actions (submit booking details, intake answers, portal
// profile edits). Zod-driven field inference + single OR
// multi-step progressive disclosure, styled with --sf-* tokens.
//
// Two modes:
//   - "single": flat form, all fields at once, submit button
//   - "multi":  progressive disclosure, steps[{fields, title}]
//               with internal state for step index + answers,
//               Next/Back navigation, Submit on last step
//
// Shipped in SLICE 4b PR 1 C3 per audit §5.3.
//
// L-17 classification: **state-machine 1.8x** when mode=multi
// (2-state transitions, per-step field validation, submission
// pending + error states). single-mode reduces to 0.94x
// composition.
//
// State reducer is exported as a pure function + unit-tested
// independently from the component — per G-4-6 shallow harness
// (renderToString won't simulate useState transitions, so the
// logic must be testable as a pure function).
//
// Client component: uses useState + useReducer. Keep auth +
// data logic in server actions passed through `action` prop;
// this component owns UI state only.

"use client";

import { useReducer, type FormEvent } from "react";
import type { ZodObject, ZodTypeAny } from "zod";

import { deriveFields, type Field } from "@/lib/ui/derive-fields";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export type CustomerActionFormStep<K extends string = string> = {
  fields: readonly K[];
  title?: string;
};

export type CustomerActionFormProps<T extends Record<string, unknown>> = {
  mode: "single" | "multi";
  schema: ZodObject<Record<string, ZodTypeAny>>;
  /** Required when mode="multi". */
  steps?: readonly CustomerActionFormStep<keyof T & string>[];
  defaultValues?: Partial<Record<keyof T & string, string | number | boolean>>;
  /** Form action target: URL string or Next server action. */
  action: string | ((formData: FormData) => void | Promise<void>);
  submitLabel?: string;
  /** Multi-mode only: override the starting step index (test hook + deep-link). */
  initialStepIndex?: number;
  /** Explicit error state (rendered when non-null). */
  errorMessage?: string | null;
  /** Optional rate-limit hint (e.g. "5 per hour"). Metadata only; enforcement lives server-side. */
  rateLimitHint?: string;
};

// ---------------------------------------------------------------------
// Reducer — pure state-transition logic (exported for unit tests)
// ---------------------------------------------------------------------

export type CustomerActionFormState = {
  stepIndex: number;
  totalSteps: number;
  answers: Record<string, string | number | boolean>;
  pending: boolean;
  error: string | null;
};

export type CustomerActionFormAction =
  | { type: "next" }
  | { type: "back" }
  | { type: "setAnswer"; key: string; value: string | number | boolean }
  | { type: "setPending"; pending: boolean }
  | { type: "setError"; error: string | null };

export function initialCustomerActionFormState({
  totalSteps,
  initialStepIndex,
  defaultValues,
}: {
  totalSteps: number;
  initialStepIndex?: number;
  defaultValues?: Record<string, string | number | boolean>;
}): CustomerActionFormState {
  return {
    stepIndex: initialStepIndex ?? 0,
    totalSteps,
    answers: { ...(defaultValues ?? {}) },
    pending: false,
    error: null,
  };
}

export function customerActionFormReducer(
  state: CustomerActionFormState,
  action: CustomerActionFormAction,
): CustomerActionFormState {
  switch (action.type) {
    case "next":
      if (state.stepIndex >= state.totalSteps - 1) return state;
      return { ...state, stepIndex: state.stepIndex + 1 };
    case "back":
      if (state.stepIndex <= 0) return state;
      return { ...state, stepIndex: state.stepIndex - 1 };
    case "setAnswer":
      return { ...state, answers: { ...state.answers, [action.key]: action.value } };
    case "setPending":
      return { ...state, pending: action.pending };
    case "setError":
      return { ...state, error: action.error };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

export function CustomerActionForm<T extends Record<string, unknown>>({
  mode,
  schema,
  steps,
  defaultValues,
  action,
  submitLabel = "Submit",
  initialStepIndex,
  errorMessage,
  rateLimitHint,
}: CustomerActionFormProps<T>) {
  const totalSteps = mode === "multi" && steps ? steps.length : 1;

  const [state, dispatch] = useReducer(
    customerActionFormReducer,
    { totalSteps, initialStepIndex, defaultValues: defaultValues as Record<string, string | number | boolean> | undefined },
    initialCustomerActionFormState,
  );

  const allFields = deriveFields<T>(schema);
  const isLastStep = state.stepIndex === totalSteps - 1;
  const isFirstStep = state.stepIndex === 0;

  const visibleFields =
    mode === "multi" && steps
      ? allFields.filter((f) => steps[state.stepIndex].fields.includes(f.key))
      : allFields;

  const hiddenFields =
    mode === "multi" && steps
      ? allFields.filter((f) => !steps[state.stepIndex].fields.includes(f.key))
      : [];

  const currentStepTitle = mode === "multi" && steps ? steps[state.stepIndex].title : undefined;

  function handleNext(e: FormEvent<HTMLFormElement>) {
    if (!e.currentTarget.checkValidity()) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    dispatch({ type: "next" });
  }

  return (
    <form
      data-customer-action-form=""
      action={isLastStep ? action : undefined}
      onSubmit={isLastStep ? undefined : handleNext}
      className="flex flex-col gap-5 p-6"
      style={{
        backgroundColor: "var(--sf-card-bg)",
        color: "var(--sf-text)",
        border: "1px solid var(--sf-border)",
        borderRadius: "var(--sf-radius)",
      }}
    >
      {mode === "multi" && steps ? (
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: "var(--sf-muted)" }}>
            {`Step ${state.stepIndex + 1} of ${totalSteps}`}
          </span>
          {rateLimitHint ? (
            <span className="text-xs" style={{ color: "var(--sf-muted)" }}>
              {rateLimitHint}
            </span>
          ) : null}
        </div>
      ) : rateLimitHint ? (
        <span className="text-xs" style={{ color: "var(--sf-muted)" }}>
          {rateLimitHint}
        </span>
      ) : null}

      {currentStepTitle ? (
        <h3 className="text-lg font-semibold" style={{ color: "var(--sf-text)" }}>
          {currentStepTitle}
        </h3>
      ) : null}

      {errorMessage ? (
        <div
          data-customer-action-form-error=""
          role="alert"
          className="px-3 py-2 text-sm rounded-md"
          style={{
            backgroundColor: "rgba(220, 38, 38, 0.08)",
            color: "rgb(220, 38, 38)",
            border: "1px solid rgba(220, 38, 38, 0.3)",
            borderRadius: "var(--sf-radius)",
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {visibleFields.map((field) => (
          <FieldRow key={field.key} field={field} value={getInitialValue(field, defaultValues)} />
        ))}
      </div>

      {/* Multi-mode carries unvisited step values through hidden inputs
          so final submission sees the full accumulated answer set. */}
      {hiddenFields.map((field) => {
        const v = getInitialValue(field, defaultValues);
        if (v === undefined || v === null) return null;
        return (
          <input
            key={`hidden-${field.key}`}
            type="hidden"
            name={field.key}
            value={typeof v === "boolean" ? (v ? "true" : "false") : String(v)}
          />
        );
      })}

      <div className="flex items-center justify-between gap-3">
        {mode === "multi" && !isFirstStep ? (
          <button
            type="button"
            onClick={() => dispatch({ type: "back" })}
            className="px-4 py-2 text-sm underline hover:no-underline"
            style={{ color: "var(--sf-muted)" }}
          >
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          type={isLastStep ? "submit" : "submit"}
          className="px-5 py-2 text-sm font-medium rounded-md"
          style={{
            backgroundColor: "var(--sf-primary)",
            color: "var(--sf-bg)",
            borderRadius: "var(--sf-radius)",
          }}
          disabled={state.pending}
        >
          {isLastStep ? submitLabel : "Next"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Per-field rendering
// ---------------------------------------------------------------------

function FieldRow<T extends Record<string, unknown>>({
  field,
  value,
}: {
  field: Field<T>;
  value: string | number | boolean | undefined;
}) {
  const id = `cf-${field.key}`;
  const label = (
    <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--sf-text)" }}>
      {field.label}
      {field.required ? <span className="ml-0.5" style={{ color: "rgb(220, 38, 38)" }}>*</span> : null}
    </label>
  );

  const common = {
    id,
    name: field.key,
    required: field.required || undefined,
    placeholder: field.placeholder,
    className: "px-3 py-2 text-base w-full",
    style: {
      backgroundColor: "var(--sf-bg)",
      color: "var(--sf-text)",
      border: "1px solid var(--sf-border)",
      borderRadius: "var(--sf-radius)",
    },
  };

  let control;
  switch (field.widget) {
    case "textarea":
      control = <textarea {...common} rows={3} defaultValue={valueOrUndef(value) as string | undefined} />;
      break;
    case "select":
      control = (
        <select {...common} defaultValue={valueOrUndef(value) as string | undefined}>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
      break;
    case "checkbox": {
      const checked = value === true || value === "true";
      return (
        <div className="flex items-center gap-2">
          <input
            id={id}
            name={field.key}
            type="checkbox"
            defaultChecked={checked}
            required={field.required || undefined}
            className="h-4 w-4"
          />
          {label}
        </div>
      );
    }
    case "number":
      control = <input {...common} type="number" defaultValue={valueOrUndef(value) as number | string | undefined} />;
      break;
    case "email":
      control = <input {...common} type="email" defaultValue={valueOrUndef(value) as string | undefined} />;
      break;
    case "url":
      control = <input {...common} type="url" defaultValue={valueOrUndef(value) as string | undefined} />;
      break;
    case "date":
      control = <input {...common} type="date" defaultValue={valueOrUndef(value) as string | undefined} />;
      break;
    case "text":
    default:
      control = <input {...common} type="text" defaultValue={valueOrUndef(value) as string | undefined} />;
      break;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {control}
    </div>
  );
}

function valueOrUndef<V>(v: V | undefined | null): V | undefined {
  return v === null || v === undefined ? undefined : v;
}

function getInitialValue<T extends Record<string, unknown>>(
  field: Field<T>,
  defaultValues: Partial<Record<keyof T & string, string | number | boolean>> | undefined,
): string | number | boolean | undefined {
  const overridden = defaultValues?.[field.key as keyof T & string];
  if (overridden !== undefined) return overridden;
  return field.defaultValue as string | number | boolean | undefined;
}
