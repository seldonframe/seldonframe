import { AutomationBuilder } from "@/components/automations/automation-builder";

export default function AutomationsPage() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-section-title">Automations</h2>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Build trigger → condition → action workflows and reuse them as templates.
        </p>
      </div>

      <AutomationBuilder />
    </section>
  );
}
