"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createContactAction } from "@/lib/contacts/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function CreateContactPageForm({ stageOptions }: { stageOptions: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();

  return (
    <form
      className="bg-card text-card-foreground rounded-xl border p-4 sm:p-6"
      action={(formData) => {
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }

            const result = await createContactAction(formData);

            if (result?.id) {
              router.push(`/contacts/${result.id}`);
              return;
            }

            router.push("/contacts");
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">First Name</label>
          <input id="firstName" name="firstName" required className="crm-input h-10 w-full px-3" placeholder="Jane" />
        </div>

        <div>
          <label htmlFor="lastName" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Last Name</label>
          <input id="lastName" name="lastName" className="crm-input h-10 w-full px-3" placeholder="Doe" />
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Email</label>
          <input id="email" name="email" type="email" className="crm-input h-10 w-full px-3" placeholder="jane@example.com" />
        </div>

        <div>
          <label htmlFor="phone" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Phone</label>
          <input id="phone" name="phone" className="crm-input h-10 w-full px-3" placeholder="(555) 123-4567" />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="status" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Stage</label>
          <select id="status" name="status" className="crm-input h-10 w-full px-3" defaultValue={stageOptions[0] ?? "lead"}>
            {stageOptions.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="notes" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Notes</label>
          <textarea id="notes" name="notes" className="crm-input min-h-[110px] w-full px-3 py-2" placeholder="Add context about this contact..." />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm text-background transition-colors hover:bg-foreground/90">
          {pending ? "Creating..." : "Create Contact"}
        </button>
      </div>
    </form>
  );
}
