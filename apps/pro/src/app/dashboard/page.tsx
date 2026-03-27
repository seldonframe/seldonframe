import { logoutProAction, requireProAuth } from "@/lib/auth/actions";
import {
  enterClientAction,
  listAdminSnapshot,
  provisionClientAction,
  saveTemplateAction,
  updateBillingAction,
  upsertWhiteLabelAction,
} from "@/lib/pro/actions";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: "1px solid #1e293b", borderRadius: 12, padding: 16, background: "#111827" }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
      {children}
    </section>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0" }} />;
}

export default async function DashboardPage() {
  const session = await requireProAuth();
  const snapshot = await listAdminSnapshot();

  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>SeldonFrame</p>
          <h1 style={{ margin: "4px 0 0", fontSize: 24 }}>Pro Admin Panel</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8" }}>Signed in as {session.email}</p>
        </div>
        <form action={logoutProAction}>
          <button type="submit" style={{ height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0" }}>
            Logout
          </button>
        </form>
      </header>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <Card title="Organizations">{snapshot.orgRows.length}</Card>
        <Card title="Templates">{snapshot.templateRows.length}</Card>
        <Card title="Billing Accounts">{snapshot.billingRows.length}</Card>
        <Card title="Provisioning Jobs">{snapshot.jobs.length}</Card>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <Card title="Provision Client">
          <form
            action={async (formData) => {
              "use server";
              await provisionClientAction(formData);
            }}
            style={{ display: "grid", gap: 8 }}
          >
            <Input name="orgName" placeholder="Organization name" required />
            <Input name="ownerName" placeholder="Owner name" required />
            <Input name="ownerEmail" type="email" placeholder="Owner email" required />
            <Input name="ownerPassword" type="password" placeholder="Owner password" required />
            <Input name="templateKey" placeholder="Template key (optional)" />
            <button type="submit" style={{ height: 36 }}>Provision</button>
          </form>
        </Card>

        <Card title="Enter Client">
          <form
            action={async (formData) => {
              "use server";
              await enterClientAction(formData);
            }}
            style={{ display: "grid", gap: 8 }}
          >
            <Input name="orgSlug" placeholder="org-slug" required />
            <button type="submit" style={{ height: 36 }}>Generate Enter-Client URL</button>
          </form>
        </Card>

        <Card title="White-Label">
          <form
            action={async (formData) => {
              "use server";
              await upsertWhiteLabelAction(formData);
            }}
            style={{ display: "grid", gap: 8 }}
          >
            <Input name="orgSlug" placeholder="org-slug" required />
            <Input name="brandName" placeholder="Brand name" required />
            <Input name="logoUrl" placeholder="Logo URL" />
            <Input name="primaryColor" placeholder="#hex" />
            <Input name="accentColor" placeholder="#hex" />
            <Input name="customDomain" placeholder="custom.domain.com" />
            <button type="submit" style={{ height: 36 }}>Save White-Label</button>
          </form>
        </Card>

        <Card title="Templates">
          <form
            action={async (formData) => {
              "use server";
              await saveTemplateAction(formData);
            }}
            style={{ display: "grid", gap: 8 }}
          >
            <Input name="key" placeholder="template-key" required />
            <Input name="name" placeholder="Template name" required />
            <Input name="description" placeholder="Description" />
            <textarea name="config" defaultValue="{}" style={{ minHeight: 120, padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0" }} />
            <button type="submit" style={{ height: 36 }}>Save Template</button>
          </form>
        </Card>

        <Card title="Billing">
          <form
            action={async (formData) => {
              "use server";
              await updateBillingAction(formData);
            }}
            style={{ display: "grid", gap: 8 }}
          >
            <Input name="orgSlug" placeholder="org-slug" required />
            <Input name="plan" placeholder="free | pro | enterprise" required />
            <Input name="status" placeholder="inactive | active | past_due" required />
            <Input name="customerId" placeholder="Customer ID" />
            <Input name="subscriptionId" placeholder="Subscription ID" />
            <button type="submit" style={{ height: 36 }}>Update Billing</button>
          </form>
        </Card>
      </div>

      <Card title="Recent Organizations">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 4px", color: "#94a3b8" }}>Name</th>
                <th style={{ textAlign: "left", padding: "8px 4px", color: "#94a3b8" }}>Slug</th>
                <th style={{ textAlign: "left", padding: "8px 4px", color: "#94a3b8" }}>Plan</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.orgRows.map((org) => (
                <tr key={org.id}>
                  <td style={{ padding: "6px 4px", borderTop: "1px solid #1f2937" }}>{org.name}</td>
                  <td style={{ padding: "6px 4px", borderTop: "1px solid #1f2937" }}>{org.slug}</td>
                  <td style={{ padding: "6px 4px", borderTop: "1px solid #1f2937" }}>{org.plan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
