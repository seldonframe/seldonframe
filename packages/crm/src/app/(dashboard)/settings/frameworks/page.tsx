import Link from "next/link";
import { deleteSavedFrameworkAction, listSavedFrameworkLibrary } from "@/lib/frameworks/actions";

export default async function SavedFrameworksPage() {
  const saved = await listSavedFrameworkLibrary();

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Saved Frameworks</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Reusable framework presets generated for this workspace.</p>
      </div>

      <article className="rounded-xl border bg-card p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {saved.length > 0 ? `${saved.length} saved framework${saved.length === 1 ? "" : "s"}` : "No saved frameworks yet"}
          </p>
          <Link href="/orgs/new" className="crm-button-secondary h-9 px-3 inline-flex items-center">
            Use in New Workspace
          </Link>
        </div>

        {saved.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Generate a custom framework in setup to save it here automatically.
          </div>
        ) : (
          <div className="space-y-3">
            {saved.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-border bg-background/40 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">{entry.description || "Custom framework"}</p>
                    <p className="text-xs text-muted-foreground">Saved {new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href="/orgs/new" className="crm-button-secondary h-8 px-3 inline-flex items-center text-xs">
                      Reuse
                    </Link>
                    <form action={deleteSavedFrameworkAction}>
                      <input type="hidden" name="frameworkId" value={entry.id} />
                      <button type="submit" className="crm-button-secondary h-8 px-3 text-xs">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground">
                  <p>
                    Pipeline: <span className="text-foreground">{entry.framework.pipeline.length}</span>
                  </p>
                  <p>
                    Booking types: <span className="text-foreground">{entry.framework.bookingTypes.length}</span>
                  </p>
                  <p>
                    Email templates: <span className="text-foreground">{entry.framework.emailTemplates.length}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
