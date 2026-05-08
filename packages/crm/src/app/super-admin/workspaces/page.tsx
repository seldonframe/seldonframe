import { PlaceholderTab } from "../placeholder-tab";

export default function WorkspacesTabPage() {
  return (
    <PlaceholderTab
      title="Workspaces"
      ship="v1.35.2"
      summary="Which workspaces are alive, which are healthy, which are at risk."
      bullets={[
        "List sortable by activity (last 24h conversation count, last agent run, eval pass rate)",
        "Filter by template/Soul (HVAC / dental / coach / agency / etc.)",
        "Filter by health status (green / amber / red — based on eval pass rate + recent error count)",
        "Per-workspace detail: template, agents installed, integrations connected, lifetime tokens, lifetime revenue from this workspace",
        "Bulk actions: send announcement, force-rerun evals, export config",
      ]}
    />
  );
}
