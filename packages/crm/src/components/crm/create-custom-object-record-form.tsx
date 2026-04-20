"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { createCustomObjectRecordAction } from "@/lib/crm/custom-object-actions";
import type { CustomObjectFieldSchema, CustomObjectRelationOption } from "@/lib/crm/custom-objects";

function inputTypeForField(type: string) {
  if (type === "integer" || type === "currency") {
    return "number";
  }

  if (type === "date") {
    return "date";
  }

  return "text";
}

export function CreateCustomObjectRecordForm({
  objectSlug,
  objectLabel,
  clientId,
  fields,
  relationOptions,
}: {
  objectSlug: string;
  objectLabel: string;
  clientId?: string | null;
  fields: CustomObjectFieldSchema[];
  relationOptions: Record<string, CustomObjectRelationOption[]>;
}) {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();
  const router = useRouter();

  return (
    <form
      id="quick-create-object-record"
      className="crm-card grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4"
      action={(formData) => {
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }

            await createCustomObjectRecordAction(formData);
            router.refresh();
          } catch (error) {
            if (isDemoBlockedError(error)) {
              showDemoToast();
              return;
            }

            throw error;
          }
        });
      }}
    >
      <input type="hidden" name="objectSlug" value={objectSlug} />
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      {fields.map((field) => {
        const options = relationOptions[field.name] ?? [];
        const isRelation = field.type === "relation";
        const isEnum = field.type === "enum" && (field.options?.length ?? 0) > 0;
        const isLongText = field.type === "long text" || field.type === "rich text";

        return (
          <div key={field.name} className={isLongText ? "md:col-span-2 xl:col-span-4" : undefined}>
            <label htmlFor={`cof-${field.name}`} className="mb-1 block text-sm text-muted-foreground">{field.label}</label>
            {isRelation ? (
              <select id={`cof-${field.name}`} name={field.name} className="crm-input h-10 w-full truncate px-3" defaultValue={clientId && /^contact$/i.test(field.relation ?? "") ? clientId : ""}>
                <option value="">Select {field.relation ?? field.label}</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}{option.subtitle ? ` — ${option.subtitle}` : ""}
                  </option>
                ))}
              </select>
            ) : isEnum ? (
              <select id={`cof-${field.name}`} name={field.name} className="crm-input h-10 w-full truncate px-3" defaultValue={field.options?.[0] ?? ""}>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : isLongText ? (
              <textarea id={`cof-${field.name}`} name={field.name} className="crm-input min-h-28 w-full px-3 py-2" placeholder={`${field.label} for this ${objectLabel.toLowerCase()}`} />
            ) : (
              <input
                id={`cof-${field.name}`}
                className="crm-input h-10 w-full px-3"
                name={field.name}
                type={inputTypeForField(field.type)}
                placeholder={field.label}
                defaultValue={field.name === "name" ? "" : undefined}
              />
            )}
          </div>
        );
      })}
      <div className="md:col-span-2 xl:col-span-4 flex justify-end">
        <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
          {pending ? `Adding ${objectLabel.toLowerCase()}...` : `Add ${objectLabel}`}
        </button>
      </div>
    </form>
  );
}
