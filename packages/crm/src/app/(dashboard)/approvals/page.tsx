// packages/crm/src/app/(dashboard)/approvals/page.tsx
//
// Never-fail-compile — the inbox for work a compiled agent PREPARED but
// could not execute itself (draft_for_approval). Flag-gated (404 off).
// Styling mirrors sibling dashboard pages (forms/page.tsx, clients/page.tsx):
// animate-page-enter shell, text-xl/2xl font-semibold tracking-tight header,
// rounded-xl border bg-card cards.
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isDraftApprovalsOn } from "@/lib/agent-drafts/policy";
import { createDrizzleDraftStore } from "@/lib/agent-drafts/storage-drizzle";
import { DraftRow } from "./draft-row";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  if (!isDraftApprovalsOn({ SF_DRAFT_APPROVALS: process.env.SF_DRAFT_APPROVALS })) notFound();
  const session = await auth();
  const orgId = session?.user?.orgId;
  if (!session?.user?.id || !orgId) redirect("/login");

  const store = createDrizzleDraftStore();
  const [pending, allDrafts] = await Promise.all([
    store.listDrafts({ orgId, status: "pending" }),
    store.listDrafts({ orgId }),
  ]);
  const resolved = allDrafts.filter((d) => d.status !== "pending").slice(0, 25);

  return (
    <section className="animate-page-enter space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Work your agents prepared and are waiting on you to approve.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nothing waiting on you — your agents will file drafts here when a step
          needs your approval.
        </div>
      ) : (
        <ul className="space-y-3">
          {pending.map((d) => (
            <DraftRow key={d.id} draft={d} />
          ))}
        </ul>
      )}

      {resolved.length > 0 ? (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Recently resolved ({resolved.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {resolved.map((d) => (
              <li key={d.id} className="rounded-xl border bg-card p-3 text-sm opacity-70">
                <span className="font-medium">{d.title}</span>{" "}
                <span className="text-xs uppercase">{d.status}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
