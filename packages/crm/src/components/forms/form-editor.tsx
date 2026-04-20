"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  FileText,
  ListChecks,
  Mail,
  Phone,
  Plus,
  Trash2,
  Type as TypeIcon,
} from "lucide-react";
import { updateFormAction } from "@/lib/forms/actions";
import { cn } from "@/lib/utils";

type EditableField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

// Canonical field types — matches intake/customize route + intake-forms
// schema + template registry. Pre-fix this list read ["phone"] which the
// API then rejected ("tel" is the accepted value). That silent mismatch
// is fixed here.
const FIELD_TYPES = [
  { value: "text", label: "Text", icon: TypeIcon },
  { value: "email", label: "Email", icon: Mail },
  { value: "tel", label: "Phone", icon: Phone },
  { value: "textarea", label: "Long text", icon: AlignLeft },
  { value: "select", label: "Choices", icon: ListChecks },
] as const;

// Typed as plain `string` key (not the literal union) so lookups from
// `field.type: string` don't narrow-fail at call sites. Missing keys return
// undefined, which the caller already handles via `?? TypeIcon` fallback.
const FIELD_TYPE_BY_VALUE: Map<string, (typeof FIELD_TYPES)[number]> = new Map(
  FIELD_TYPES.map((t) => [t.value, t])
);

export function FormEditor({
  formId,
  initialName,
  initialSlug,
  initialFields,
}: {
  formId: string;
  initialName: string;
  initialSlug: string;
  initialFields: EditableField[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [fields, setFields] = useState<EditableField[]>(initialFields);

  const serializedFields = useMemo(() => JSON.stringify(fields), [fields]);

  function updateField(index: number, patch: Partial<EditableField>) {
    setFields((current) =>
      current.map((field, i) => {
        if (i !== index) return field;
        const next = { ...field, ...patch };
        if (next.type !== "select") next.options = undefined;
        return next;
      })
    );
  }

  function removeField(index: number) {
    setFields((current) => current.filter((_, i) => i !== index));
  }

  function addField() {
    setFields((current) => [
      ...current,
      {
        key: `field_${current.length + 1}`,
        label: `Field ${current.length + 1}`,
        type: "text",
        required: false,
      },
    ]);
  }

  function moveField(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fields.length) return;
    setFields((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  return (
    <form
      className="space-y-4"
      action={(formData) => {
        startTransition(async () => {
          await updateFormAction(formData);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="formId" value={formId} />
      <input type="hidden" name="fields" value={serializedFields} />

      {/* ────── Name + Slug ────── */}
      <section className="rounded-2xl border border-border/80 bg-card/60 p-4 shadow-(--shadow-xs)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="form-edit-name" className="text-xs font-medium text-muted-foreground">
              Form name
            </label>
            <input
              id="form-edit-name"
              name="name"
              className="crm-input h-9 w-full px-3"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="form-edit-slug" className="text-xs font-medium text-muted-foreground">
              Slug
            </label>
            <input
              id="form-edit-slug"
              name="slug"
              className="crm-input h-9 w-full px-3 font-mono text-sm"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              required
            />
            <p className="text-[11px] text-muted-foreground">Public URL: /forms/{slug || "…"}</p>
          </div>
        </div>
      </section>

      {/* ────── Fields ────── */}
      <section className="rounded-2xl border border-border/80 bg-card/60 shadow-(--shadow-xs)">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Fields</p>
            <span className="text-xs tabular-nums text-muted-foreground">{fields.length}</span>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={addField}
          >
            <Plus className="size-3.5" />
            Add field
          </button>
        </div>

        {fields.length === 0 ? (
          <div className="p-6">
            <div className="mx-auto max-w-md rounded-xl border border-dashed border-border/80 bg-background/35 px-5 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No fields yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add fields manually, or pick a template when creating a new form.
              </p>
              <button
                type="button"
                className="crm-button-primary mt-4 h-9 px-5 text-xs"
                onClick={addField}
              >
                <Plus className="size-3.5" />
                Add first field
              </button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {fields.map((field, index) => {
              const currentType = FIELD_TYPE_BY_VALUE.get(field.type);
              const CurrentIcon = currentType?.icon ?? TypeIcon;
              return (
                <li
                  key={`${field.key}-${index}`}
                  className="group/field flex flex-col gap-3 p-4 transition-colors hover:bg-accent/20"
                >
                  <div className="flex items-start gap-3">
                    {/* Order indicator + drag affordance placeholder */}
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/60 text-[11px] tabular-nums text-muted-foreground">
                      {index + 1}
                    </div>

                    {/* Label + Key inputs */}
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Label
                        </label>
                        <input
                          className="crm-input h-8 w-full px-2 text-sm"
                          value={field.label}
                          onChange={(event) => updateField(index, { label: event.target.value })}
                          placeholder="Full name"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Key
                        </label>
                        <input
                          className="crm-input h-8 w-full px-2 font-mono text-xs"
                          value={field.key}
                          onChange={(event) => updateField(index, { key: event.target.value })}
                          placeholder="full_name"
                        />
                      </div>
                    </div>

                    {/* Right-side row controls: fade in on hover */}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/field:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => moveField(index, -1)}
                        aria-label="Move up"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
                        disabled={index === fields.length - 1}
                        onClick={() => moveField(index, 1)}
                        aria-label="Move down"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:border-negative/40 hover:bg-negative/10 hover:text-negative"
                        onClick={() => removeField(index)}
                        aria-label="Remove field"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Type pills — 5 options, button group is cleaner than select */}
                  <div className="flex items-center gap-2 pl-11">
                    <div className="flex flex-wrap gap-1">
                      {FIELD_TYPES.map((type) => {
                        const Icon = type.icon;
                        const selected = field.type === type.value;
                        return (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => updateField(index, { type: type.value })}
                            className={cn(
                              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
                              selected
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border/60 bg-background/60 text-muted-foreground hover:bg-background hover:text-foreground"
                            )}
                          >
                            <Icon className="size-3" />
                            {type.label}
                          </button>
                        );
                      })}
                    </div>
                    <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={field.required}
                        onChange={(event) => updateField(index, { required: event.target.checked })}
                      />
                      Required
                    </label>
                  </div>

                  {/* Options (select only) */}
                  {field.type === "select" ? (
                    <div className="flex flex-col gap-1 pl-11">
                      <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Options (comma-separated)
                      </label>
                      <input
                        className="crm-input h-8 w-full px-2 text-sm"
                        value={(field.options ?? []).join(", ")}
                        onChange={(event) =>
                          updateField(index, {
                            options: event.target.value
                              .split(",")
                              .map((option) => option.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Small, Medium, Large"
                      />
                      {(field.options?.length ?? 0) > 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          {field.options?.length} {field.options?.length === 1 ? "option" : "options"}
                          {(field.options?.length ?? 0) > 6 ? " · will render as native dropdown in public form" : " · will render as button group"}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Preview of the current type's meta — compact */}
                  <p className="pl-11 text-[11px] text-muted-foreground">
                    <CurrentIcon className="mr-1 inline size-3" />
                    {currentType?.label ?? field.type}
                    {field.required ? " · required" : " · optional"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex items-center justify-end gap-2">
        <button type="submit" className="crm-button-primary h-10 px-6" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
