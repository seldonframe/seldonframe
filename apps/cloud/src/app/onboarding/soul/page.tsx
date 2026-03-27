import { requireCloudAuth } from "@/lib/auth/actions";
import { CloudSoulWizard } from "@/components/cloud/cloud-soul-wizard";

export default async function CloudSoulOnboardingPage() {
  await requireCloudAuth();

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 760 }}>
        <CloudSoulWizard />
      </div>
    </main>
  );
}
