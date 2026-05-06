// v1.21.0 — customer-portal account
//
// Read-only view of the customer's contact info as the business has
// it on file, plus a tap-to-call/tap-to-email block to reach the
// business if they want to update something. v1.21 ships READ-ONLY;
// v1.22 will add self-edit (name, phone, preferences) with operator
// notification on change.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import { requirePortalSessionForOrg, clearPortalSessionAction } from "@/lib/portal/auth";

export default async function CustomerAccountPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSessionForOrg(orgSlug);

  const [orgRow, blueprintRow] = await Promise.all([
    db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, session.orgId))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({ blueprint: landingPages.blueprintJson })
      .from(landingPages)
      .where(eq(landingPages.orgId, session.orgId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const orgName = orgRow?.name ?? "Your business";
  const blueprint = (blueprintRow?.blueprint ?? null) as
    | { workspace?: { contact?: { phone?: string; email?: string } } }
    | null;
  const businessPhone = blueprint?.workspace?.contact?.phone ?? null;
  const businessEmail = blueprint?.workspace?.contact?.email ?? null;

  const fullName =
    `${session.contact.firstName ?? ""} ${session.contact.lastName ?? ""}`.trim() ||
    null;

  return (
    <div className="space-y-5">
      <header>
        <h1
          className="text-[22px] font-semibold tracking-tight"
          style={{ color: "#111" }}
        >
          Your account
        </h1>
        <p className="text-[13px]" style={{ color: "#666" }}>
          What {orgName} has on file for you.
        </p>
      </header>

      <section
        className="px-5 py-4 sm:px-6 sm:py-5 space-y-3"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
      >
        <h2
          className="text-[12px] uppercase tracking-wide pb-3"
          style={{ color: "#888", borderBottom: "1px solid #F0F0EC" }}
        >
          Your details
        </h2>
        <DetailRow label="Name" value={fullName ?? "Not on file"} />
        <DetailRow label="Email" value={session.contact.email ?? "Not on file"} />
      </section>

      <section
        className="px-5 py-4 sm:px-6 sm:py-5 space-y-3"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
      >
        <h2
          className="text-[12px] uppercase tracking-wide pb-3"
          style={{ color: "#888", borderBottom: "1px solid #F0F0EC" }}
        >
          Reach {orgName}
        </h2>
        <p className="text-[13px]" style={{ color: "#666" }}>
          Need to update something or have a question? Get in touch:
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {businessPhone ? (
            <a
              href={`tel:${businessPhone}`}
              className="inline-flex h-10 items-center gap-2 px-4 text-[13px] font-semibold"
              style={{
                backgroundColor: "#111",
                color: "#FFFFFF",
                border: "1px solid #111",
                borderRadius: "8px",
              }}
            >
              <span aria-hidden>{"☎"}</span>
              <span>Call {businessPhone}</span>
            </a>
          ) : null}
          {businessEmail ? (
            <a
              href={`mailto:${businessEmail}`}
              className="inline-flex h-10 items-center gap-2 px-4 text-[13px] font-medium"
              style={{
                backgroundColor: "#FFFFFF",
                color: "#111",
                border: "1px solid #E5E5E1",
                borderRadius: "8px",
              }}
            >
              <span aria-hidden>{"✉"}</span>
              <span>Email us</span>
            </a>
          ) : null}
          {!businessPhone && !businessEmail ? (
            <p className="text-[13px]" style={{ color: "#888" }}>
              Contact info not yet on file.
            </p>
          ) : null}
        </div>
      </section>

      <section
        className="px-5 py-4 sm:px-6 sm:py-5"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
      >
        <h2
          className="text-[12px] uppercase tracking-wide pb-3 mb-3"
          style={{ color: "#888", borderBottom: "1px solid #F0F0EC" }}
        >
          Sign-in
        </h2>
        <p className="text-[13px]" style={{ color: "#666" }}>
          Signed in as{" "}
          <span style={{ color: "#111", fontWeight: 600 }}>
            {session.contact.email}
          </span>
          .
        </p>
        <form action={clearPortalSessionAction.bind(null, orgSlug)} className="mt-3">
          <button
            type="submit"
            className="inline-flex h-9 items-center px-4 text-[12px] font-medium"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#666",
              border: "1px solid #E5E5E1",
              borderRadius: "8px",
            }}
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1">
      <span className="text-[12px]" style={{ color: "#888" }}>
        {label}
      </span>
      <span className="text-[13px]" style={{ color: "#111" }}>
        {value}
      </span>
    </div>
  );
}
