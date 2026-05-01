import Link from "next/link";
import { EndClientChat } from "@/components/end-client-chat";
import { clearPortalSessionAction, requirePortalSessionForOrg } from "@/lib/portal/auth";
import { getUnreadPortalMessageCount } from "@/lib/portal/actions";
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
  const unreadMessages = await getUnreadPortalMessageCount(session);
  const displayName = `${session.contact.firstName} ${session.contact.lastName ?? ""}`.trim();

  return (
    <>
      <main className="crm-page mx-auto w-full max-w-5xl space-y-6 py-8">
        <header className="crm-card flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-label text-muted-foreground">Client Portal</p>
            <h1 className="text-section-title">Welcome, {displayName || session.contact.email || "Client"}</h1>
          </div>

          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/portal/${orgSlug}`} className="crm-button-secondary h-9 px-3">Overview</Link>
            <Link href={`/portal/${orgSlug}/pipeline`} className="crm-button-secondary h-9 px-3">My Pipeline</Link>
            <Link href={`/portal/${orgSlug}/bookings`} className="crm-button-secondary h-9 px-3">Bookings</Link>
            <Link
              href={`/portal/${orgSlug}/messages`}
              className="crm-button-secondary inline-flex h-9 items-center gap-2 px-3"
            >
              <span>Messages</span>
              {unreadMessages > 0 ? (
                <span
                  aria-label={`${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}`}
                  className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[hsl(var(--color-primary))] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[hsl(var(--color-primary-foreground))]"
                >
                  {unreadMessages > 99 ? "99+" : unreadMessages}
                </span>
              ) : null}
            </Link>
            <Link href={`/portal/${orgSlug}/resources`} className="crm-button-secondary h-9 px-3">Documents</Link>
            <form action={clearPortalSessionAction.bind(null, orgSlug)}>
              <button type="submit" className="crm-button-ghost h-9 px-3">Logout</button>
            </form>
          </nav>
        </header>

        {children}
      </main>

      {harnessRules.end_client_customization ? <EndClientChat orgSlug={orgSlug} /> : null}
    </>
  );
}
