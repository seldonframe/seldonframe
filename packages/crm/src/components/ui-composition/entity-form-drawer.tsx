// <EntityFormDrawer> — admin create/edit form drawer with fields
// auto-derived from a Zod schema.
//
// Server component. URL-driven open/close (parent reads
// searchParams, computes the `open` prop). Submits to a Next
// server action (or API route) via native form POST. Zero client
// JS required at v1 — shadcn's interactive Sheet is deferred to a
// follow-up that ships the edit-in-place pattern.
//
// Usage:
//   <EntityFormDrawer
//     open={searchParams.create === "1"}
//     title="New Contact"
//     schema={ContactSchema}
//     defaultValues={existingContact ?? undefined}
//     closeHref="/contacts"
//     action={createContact}           // server action
//     submitLabel="Create contact"
//     fields={{                         // optional overrides
//       notes: { widget: "textarea", placeholder: "Context about this contact" },
//     }}
//   />
//
// Shipped in SLICE 4a PR 2 C2 per audit §2.1.
//
// A11y:
//   role="dialog" + aria-label for screen reader identification.
//   Every field has a <label> bound via htmlFor/id. Required fields
//   render a visible asterisk + `required` attr.
//
// Validation:
//   Client: `required` + `type="email"` / `type="url"` leverage the
//   browser's built-in form validation.
//   Server: the action parses `formData` through the same Zod schema
//   before persisting. Zod validation errors surface via the parent.
//
// Deferred to a later slice:
//   - Field error rendering (needs server action return shape + useFormState).
//   - Animation + focus trap (shadcn Sheet once we're ready to ship client JS).
//   - Multi-step / tabbed forms.

import type { ReactNode } from "react";
import Link from "next/link";
import type { ZodObject, ZodTypeAny } from "zod";

import {
  deriveFields,
  type Field,
  type FieldOverride,
} from "@/lib/ui/derive-fields";

export type EntityFormDrawerProps<T extends Record<string, unknown>> = {
  open: boolean;
  title: string;
  schema: ZodObject<Record<string, ZodTypeAny>>;
  /** Initial values — keyed by schema field. Overrides schema .default(). */
  defaultValues?: Partial<T>;
  closeHref: string;
  /** Form action target: URL string or Next server action. */
  action: string | ((formData: FormData) => void | Promise<void>);
  /** Per-field widget / label / placeholder overrides. */
  fields?: Partial<Record<keyof T & string, FieldOverride>>;
  submitLabel?: string;
};

export function EntityFormDrawer<T extends Record<string, unknown>>({
  open,
  title,
  schema,
  defaultValues,
  closeHref,
  action,
  fields: fieldOverrides,
  submitLabel = "Save",
}: EntityFormDrawerProps<T>) {
  if (!open) return null;

  const fields = deriveFields<T>(schema, { overrides: fieldOverrides });

  return (
    <aside
      data-entity-form-drawer=""
      role="dialog"
      aria-label={title}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl"
    >
      <header className="flex items-start justify-between gap-4 border-b border-border p-6">
        <h2 className="text-page-title text-foreground">{title}</h2>
        <Link
          data-entity-form-close=""
          href={closeHref}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast"
        >
          {/* Close glyph — plain text × keeps us off lucide-react for a server component. */}
          <span aria-hidden="true" className="text-body">×</span>
        </Link>
      </header>

      <form action={action} className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
        {fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={getInitialValue(field, defaultValues)}
          />
        ))}
        <div className="mt-auto flex items-center justify-end gap-3 pt-4">
          <Link
            href={closeHref}
            className="rounded-md px-4 py-2 text-label text-muted-foreground hover:text-foreground transition-colors duration-fast"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-label text-primary-foreground hover:bg-primary/90 transition-colors duration-fast"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </aside>
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
  value: unknown;
}): ReactNode {
  const id = `field-${field.key}`;
  const labelNode = (
    <label htmlFor={id} className="text-label text-foreground">
      {field.label}
      {field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
    </label>
  );

  const common = {
    id,
    name: field.key,
    required: field.required || undefined,
    placeholder: field.placeholder,
    className:
      "rounded-md border border-border bg-background px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
  };

  let control: ReactNode;
  switch (field.widget) {
    case "textarea":
      control = (
        <textarea
          {...common}
          defaultValue={typeof value === "string" ? value : ""}
          rows={3}
        />
      );
      break;
    case "select":
      control = (
        <select
          {...common}
          defaultValue={typeof value === "string" ? value : undefined}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
      break;
    case "checkbox": {
      const checked = value === true || value === "true" || value === "on";
      return (
        <div className="flex items-center gap-2">
          <input
            id={id}
            name={field.key}
            type="checkbox"
            defaultChecked={checked}
            required={field.required || undefined}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          {labelNode}
        </div>
      );
    }
    case "number":
      control = (
        <input
          {...common}
          type="number"
          defaultValue={
            typeof value === "number"
              ? value
              : typeof value === "string" && value !== ""
              ? value
              : undefined
          }
        />
      );
      break;
    case "email":
      control = <input {...common} type="email" defaultValue={stringify(value)} />;
      break;
    case "url":
      control = <input {...common} type="url" defaultValue={stringify(value)} />;
      break;
    case "date":
      control = <input {...common} type="date" defaultValue={formatDate(value)} />;
      break;
    case "text":
    default:
      control = <input {...common} type="text" defaultValue={stringify(value)} />;
      break;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {labelNode}
      {control}
    </div>
  );
}

function getInitialValue<T>(
  field: Field<T>,
  defaultValues: Partial<T> | undefined,
): unknown {
  const overridden = defaultValues?.[field.key as keyof T];
  if (overridden !== undefined) return overridden;
  return field.defaultValue;
}

function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return undefined;
}

function formatDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return undefined;
}
