import Link from "next/link";
import { EndClientChat } from "@/components/end-client-chat";
import { clearPortalSessionAction, requirePortalSessionForOrg } from "@/lib/portal/auth";
import { getHarnessRules } from "@/lib/harness-rules";

export default async function PortalClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSessionForOrg(orgSlug);
  const harnessRules = getHarnessRules();
  const displayName = `${session.contact.firstName} ${session.contact.lastName ?? ""}`.trim();

  return (
    <>
      <main className="crm-page mx-auto w-full max-w-5xl space-y-4 py-6">
        <header className="crm-card flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-label text-[hsl(var(--color-text-muted))]">Client Portal</p>
            <h1 className="text-section-title">Welcome, {displayName || session.contact.email || "Client"}</h1>
          </div>

          <nav className="flex items-center gap-2 text-sm">
            <Link href={`/portal/${orgSlug}`} className="rounded border border-border px-3 py-1.5">Overview</Link>
            <Link href={`/portal/${orgSlug}/messages`} className="rounded border border-border px-3 py-1.5">Messages</Link>
            <Link href={`/portal/${orgSlug}/resources`} className="rounded border border-border px-3 py-1.5">Resources</Link>
            <form action={clearPortalSessionAction.bind(null, orgSlug)}>
              <button type="submit" className="rounded border border-border px-3 py-1.5">Logout</button>
            </form>
          </nav>
        </header>

        {children}
      </main>

      {harnessRules.end_client_customization ? <EndClientChat orgSlug={orgSlug} /> : null}
    </>
  );
}
