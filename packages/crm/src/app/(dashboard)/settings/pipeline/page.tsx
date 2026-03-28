import { getDefaultPipeline } from "@/lib/deals/actions";

export default async function SettingsPipelinePage() {
  const pipeline = await getDefaultPipeline();

  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-light tracking-tight">Pipeline Settings</h1>
      <div className="crm-card p-4">
        <p className="text-sm">Default pipeline: {pipeline?.name ?? "Not configured"}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {(Array.isArray(pipeline?.stages) ? pipeline?.stages : []).map((stage, idx) => (
            <li key={idx}>{(stage as { name: string }).name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
