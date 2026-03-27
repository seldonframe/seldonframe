import { getSoul } from "@/lib/soul/server";

export default async function SettingsFieldsPage() {
  const soul = await getSoul();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Custom Fields</h1>
      <div className="crm-card p-4">
        <p className="text-sm font-medium">Suggested contact fields</p>
        <ul className="mt-2 space-y-1 text-sm">
          {(soul?.suggestedFields.contact ?? []).map((field) => (
            <li key={field.key}>{field.label} ({field.type})</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
