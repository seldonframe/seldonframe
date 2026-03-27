import { requireFeatureTier } from "@/lib/cloud/actions";

export default async function CloudAutomationPage() {
  await requireFeatureTier("pro");

  return (
    <main style={{ padding: 24 }}>
      <section style={{ border: "1px solid #1e293b", borderRadius: 12, padding: 16, background: "#111827" }}>
        <h1 style={{ marginTop: 0 }}>Automation Center (Pro)</h1>
        <p style={{ color: "#94a3b8" }}>Tier enforcement is active. This section is available for Pro and Enterprise plans only.</p>
      </section>
    </main>
  );
}
