"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { createFormAction } from "@/lib/forms/actions";

const defaultFields = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "message", label: "Message", type: "textarea", required: false },
];

export function FormsPageActions() {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("New Intake Form");
  const [slug, setSlug] = useState("new-intake-form");

  return (
    <>
      <button type="button" className="crm-button-primary h-9 px-6" onClick={() => setShowCreate(true)}>
        Create Form
      </button>

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="right" className="h-full w-full max-w-none border-0 bg-background p-0">
          <div className="h-full overflow-auto p-6">
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-medium text-foreground">Create form</h2>
                <button type="button" className="crm-button-ghost h-9 px-4" onClick={() => setShowCreate(false)}>
                  Close
                </button>
              </div>

              <form
                action={(formData) => {
                  startTransition(async () => {
                    const result = await createFormAction(formData);
                    setShowCreate(false);
                    if (result?.id) {
                      router.push(`/forms/${result.id}/edit`);
                      return;
                    }
                    router.push("/forms");
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="form-name" className="mb-1 block text-sm text-muted-foreground">Name</label>
                  <input
                    id="form-name"
                    name="name"
                    className="crm-input h-9 w-full px-3"
                    value={name}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setName(nextName);
                      if (!slug || slug === "new-intake-form") {
                        setSlug(
                          nextName
                            .toLowerCase()
                            .trim()
                            .replace(/[^a-z0-9\s-]/g, "")
                            .replace(/\s+/g, "-")
                            .replace(/-+/g, "-") || "new-intake-form"
                        );
                      }
                    }}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="form-slug" className="mb-1 block text-sm text-muted-foreground">Slug</label>
                  <input
                    id="form-slug"
                    name="slug"
                    className="crm-input h-9 w-full px-3"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    required
                  />
                </div>

                <input type="hidden" name="fields" value={JSON.stringify(defaultFields)} />

                <div className="pt-2">
                  <button type="submit" className="crm-button-primary h-10 px-6" disabled={pending}>
                    {pending ? "Creating..." : "Create Form"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
