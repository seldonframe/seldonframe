"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateFormAction } from "@/lib/forms/actions";

type EditableField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

const fieldTypes = ["text", "email", "phone", "textarea", "select"];

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
        if (i !== index) {
          return field;
        }

        const next = { ...field, ...patch };
        if (next.type !== "select") {
          next.options = undefined;
        }

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
        key: `field-${current.length + 1}`,
        label: `Field ${current.length + 1}`,
        type: "text",
        required: false,
      },
    ]);
  }

  function moveField(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fields.length) {
      return;
    }

    setFields((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  return (
    <form
      className="rounded-xl border bg-card p-5 space-y-4"
      action={(formData) => {
        startTransition(async () => {
          await updateFormAction(formData);
          router.refresh();
        });
      }}
    >
      <input type="hidden" name="formId" value={formId} />
      <input type="hidden" name="fields" value={serializedFields} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="form-edit-name" className="mb-1 block text-sm text-muted-foreground">Name</label>
          <input
            id="form-edit-name"
            name="name"
            className="crm-input h-9 w-full px-3"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="form-edit-slug" className="mb-1 block text-sm text-muted-foreground">Slug</label>
          <input
            id="form-edit-slug"
            name="slug"
            className="crm-input h-9 w-full px-3"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Fields</p>
          <button type="button" className="crm-button-secondary h-9 px-4 text-xs" onClick={addField}>
            Add Field
          </button>
        </div>

        {fields.map((field, index) => (
          <div key={`${field.key}-${index}`} className="rounded-lg border border-border p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Label</label>
                <input
                  className="crm-input h-9 w-full px-3"
                  value={field.label}
                  onChange={(event) => updateField(index, { label: event.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Key</label>
                <input
                  className="crm-input h-9 w-full px-3"
                  value={field.key}
                  onChange={(event) => updateField(index, { key: event.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Type</label>
                <select
                  className="crm-input h-9 w-full px-3"
                  value={field.type}
                  onChange={(event) => updateField(index, { type: event.target.value })}
                >
                  {fieldTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {field.type === "select" ? (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Options (comma-separated)</label>
                <input
                  className="crm-input h-9 w-full px-3"
                  value={(field.options ?? []).join(", ")}
                  onChange={(event) =>
                    updateField(index, {
                      options: event.target.value
                        .split(",")
                        .map((option) => option.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => updateField(index, { required: event.target.checked })}
                />
                Required
              </label>

              <div className="ml-auto flex items-center gap-2">
                <button type="button" className="crm-button-ghost h-8 px-3 text-xs" onClick={() => moveField(index, -1)}>
                  Up
                </button>
                <button type="button" className="crm-button-ghost h-8 px-3 text-xs" onClick={() => moveField(index, 1)}>
                  Down
                </button>
                <button type="button" className="crm-button-ghost h-8 px-3 text-xs" onClick={() => removeField(index)}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2">
        <button type="submit" className="crm-button-primary h-10 px-6" disabled={pending}>
          {pending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
