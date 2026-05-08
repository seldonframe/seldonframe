import { PlaceholderTab } from "../placeholder-tab";

export default function UsersTabPage() {
  return (
    <PlaceholderTab
      title="Users"
      ship="v1.35.1"
      summary="Who's signed up, who's active, who's paying. Listed and filterable."
      bullets={[
        "List of all users with search by email/name",
        "Filter by plan (Free / Growth / Scale)",
        "Filter by activity (active 7d / dormant 30d / churned)",
        "Per-user drill-down: workspaces owned, lifetime tokens, lifetime revenue, last seen",
        "Export to CSV for cohort analysis",
      ]}
    />
  );
}
