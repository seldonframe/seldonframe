"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { createFormAction } from "@/lib/forms/actions";
import { INTAKE_FORM_TEMPLATES, getIntakeFormTemplate } from "@/lib/forms/templates";

function toSlug(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "new-intake-form"
  );
}

export function FormsPageActions({ buttonLabel = "+ New Form" }: { buttonLabel?: string }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();

  // Two-step create: pick a template, then confirm name + slug (both
  // pre-filled from the template). Users can edit name/slug before submit
  // or go back to pick a different template.
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const selectedTemplate = useMemo(
    () => (selectedTemplateId ? getIntakeFormTemplate(selectedTemplateId) : null),
    [selectedTemplateId]
  );

  function reset() {
    setStep("pick");
    setSelectedTemplateId(null);
    setName("");
    setSlug("");
  }

  function handleClose(open: boolean) {
    setShowCreate(open);
    if (!open) reset();
  }

  function handlePickTemplate(id: string) {
    const template = getIntakeFormTemplate(id);
    if (!template) return;
    setSelectedTemplateId(id);
    setName(template.name === "Blank form" ? "New Intake Form" : template.name);
    setSlug(template.defaultSlug);
    setStep("confirm");
  }

  return (
    <>
      <button type="button" className="crm-button-primary h-9 px-6" onClick={() => setShowCreate(true)}>
        {buttonLabel}
      </button>

      <Sheet open={showCreate} onOpenChange={handleClose}>
        <SheetContent side="right" className="h-full w-full max-w-none border-0 bg-background p-0">
          <div className="h-full overflow-auto p-6">
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-medium text-foreground">
                    {step === "pick" ? "Start a new form" : "Name your form"}
                  </h2>
                  {step === "pick" ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pick a template to skip the blank canvas. You can edit everything afterwards.
                    </p>
                  ) : selectedTemplate ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Based on <span className="text-foreground">{selectedTemplate.name}</span> ·{" "}
                      {selectedTemplate.fields.length}{" "}
                      {selectedTemplate.fields.length === 1 ? "field" : "fields"}
                    </p>
                  ) : null}
                </div>
                <button type="button" className="crm-button-ghost h-9 px-4" onClick={() => handleClose(false)}>
                  Close
                </button>
              </div>

              {step === "pick" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {INTAKE_FORM_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handlePickTemplate(template.id)}
                      className="group text-left rounded-xl border border-border bg-card/50 p-4 transition-all hover:border-primary/40 hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl" aria-hidden>
                          {template.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{template.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                          {template.fields.length > 0 ? (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              {template.fields.length}{" "}
                              {template.fields.length === 1 ? "field" : "fields"} ·{" "}
                              {template.fields
                                .slice(0, 3)
                                .map((field) => field.label)
                                .join(" · ")}
                              {template.fields.length > 3 ? ` · +${template.fields.length - 3}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <form
                  action={(formData) => {
                    startTransition(async () => {
                      const result = await createFormAction(formData);
                      handleClose(false);
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
                    <label htmlFor="form-name" className="mb-1 block text-sm text-muted-foreground">
                      Name
                    </label>
                    <input
                      id="form-name"
                      name="name"
                      className="crm-input h-9 w-full px-3"
                      value={name}
                      onChange={(event) => {
                        const nextName = event.target.value;
                        setName(nextName);
                        // Auto-sync slug from name unless the user has edited
                        // the slug away from the template's default suggestion.
                        if (!slug || slug === (selectedTemplate?.defaultSlug ?? "new-intake-form")) {
                          setSlug(toSlug(nextName));
                        }
                      }}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="form-slug" className="mb-1 block text-sm text-muted-foreground">
                      Slug
                    </label>
                    <input
                      id="form-slug"
                      name="slug"
                      className="crm-input h-9 w-full px-3"
                      value={slug}
                      onChange={(event) => setSlug(event.target.value)}
                      required
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Public URL: /forms/{slug || "new-intake-form"}
                    </p>
                  </div>

                  <input
                    type="hidden"
                    name="fields"
                    value={JSON.stringify(selectedTemplate?.fields ?? [])}
                  />

                  {selectedTemplate && selectedTemplate.fields.length > 0 ? (
                    <div className="rounded-xl border border-border bg-card/30 p-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Pre-filled fields
                      </p>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {selectedTemplate.fields.map((field) => (
                          <li key={field.key} className="flex items-center justify-between gap-2">
                            <span className="text-foreground">{field.label}</span>
                            <span className="text-xs uppercase tracking-wide">
                              {field.type}
                              {field.required ? " · required" : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      className="crm-button-ghost h-10 px-4"
                      onClick={() => setStep("pick")}
                    >
                      ← Back to templates
                    </button>
                    <button type="submit" className="crm-button-primary h-10 px-6" disabled={pending}>
                      {pending ? "Creating..." : "Create form"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
