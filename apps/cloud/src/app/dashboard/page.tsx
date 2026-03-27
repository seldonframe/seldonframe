import Link from "next/link";
import { logoutCloudAction, requireSoulCompleted } from "@/lib/auth/actions";
import { listCloudDashboardData, rerunProvisioningAction } from "@/lib/cloud/actions";

export default async function CloudDashboardPage() {
  await requireSoulCompleted();
  const { org, jobs } = await listCloudDashboardData();

  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>Cloud Workspace</p>
          <h1 style={{ margin: "4px 0 0", fontSize: 24 }}>{org.name}</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8" }}>Plan: {org.plan}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/billing" style={{ height: 36, display: "inline-flex", alignItems: "center", padding: "0 12px", border: "1px solid #334155", borderRadius: 8 }}>
            Billing
          </Link>
          <Link href="/dashboard/automation" style={{ height: 36, display: "inline-flex", alignItems: "center", padding: "0 12px", border: "1px solid #334155", borderRadius: 8 }}>
            Automation (Pro)
          </Link>
          <form action={logoutCloudAction}>
            <button type="submit" style={{ height: 36, padding: "0 12px", borderRadius: 8 }}>Logout</button>
          </form>
        </div>
      </header>

      <section style={{ border: "1px solid #1e293b", borderRadius: 12, padding: 16, background: "#111827" }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Provisioning</h2>
        <form action={rerunProvisioningAction}>
          <button type="submit" style={{ height: 36, padding: "0 12px" }}>Run Provisioning</button>
        </form>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 4px", color: "#94a3b8" }}>Status</th>
                <th style={{ textAlign: "left", padding: "8px 4px", color: "#94a3b8" }}>Template</th>
                <th style={{ textAlign: "left", padding: "8px 4px", color: "#94a3b8" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td style={{ padding: "6px 4px", borderTop: "1px solid #1f2937" }}>{job.status}</td>
                  <td style={{ padding: "6px 4px", borderTop: "1px solid #1f2937" }}>{job.template}</td>
                  <td style={{ padding: "6px 4px", borderTop: "1px solid #1f2937" }}>{new Date(job.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
