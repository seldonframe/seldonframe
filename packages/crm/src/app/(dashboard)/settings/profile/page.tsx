import { getSoul } from "@/lib/soul/server";

export default async function SettingsProfilePage() {
  const soul = await getSoul();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Business Profile</h1>
      <div className="crm-card p-4">
        <p className="text-sm">Business: {soul?.businessName ?? "Not set"}</p>
        <p className="text-sm">Industry: {soul?.industry ?? "Not set"}</p>
        <p className="mt-2 text-sm text-[hsl(var(--color-text-secondary))]">Edit via Soul setup to regenerate labels, voice, and pipeline defaults.</p>
      </div>
    </section>
  );
}
