"use client";

import { useState, useTransition } from "react";
import { submitPublicIntakeAction } from "@/lib/forms/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

type Field = { key: string; label: string; type: string; required: boolean; options?: string[] };

export function PublicForm({ orgSlug, formSlug, fields }: { orgSlug: string; formSlug: string; fields: Field[] }) {
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const { showDemoToast } = useDemoToast();

  return (
    <form
      className="crm-card space-y-3 p-4"
      action={(formData) => {
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }

            const payload: Record<string, unknown> = {};

            for (const field of fields) {
              payload[field.key] = formData.get(field.key);
            }

            await submitPublicIntakeAction({ orgSlug, formSlug, data: payload });
            setSuccess(true);
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
      {fields.map((field) => (
        <div key={field.key} className="space-y-1">
          <label htmlFor={field.key} className="text-sm font-medium">{field.label}</label>
          <input id={field.key} name={field.key} required={field.required} className="crm-input h-10 w-full px-3" />
        </div>
      ))}

      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Submitting..." : "Submit"}
      </button>

      {success ? <p className="text-sm text-green-600">Thanks, your form was submitted.</p> : null}
    </form>
  );
}
