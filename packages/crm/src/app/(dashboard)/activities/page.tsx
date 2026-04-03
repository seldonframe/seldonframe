import { getCurrentUser } from "@/lib/auth/helpers";
import { listActivities } from "@/lib/activities/actions";
import { getLabels } from "@/lib/soul/labels";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { ActivityForm } from "@/components/activities/activity-form";
import { CircleDot, Users, UserCheck, BellRing } from "lucide-react";

/*
Square UI Leads class references (from template source):
- Stats wrapper: "bg-card text-card-foreground rounded-xl border"
- Stats grid: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y divide-x-0 lg:divide-x sm:divide-y-0 divide-border"
- Table wrapper: "bg-card text-card-foreground rounded-xl border"
- Header row: "bg-muted/50"
- Row behavior: "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
- Cell classes: "text-foreground h-10 px-2 ..." and "p-2 align-middle whitespace-nowrap"
*/

export default async function ActivitiesPage() {
  const [user, labels, rows] = await Promise.all([getCurrentUser(), getLabels(), listActivities()]);
  const taskCount = rows.filter((item) => item.type === "task").length;
  const noteCount = rows.filter((item) => item.type === "note").length;
  const callCount = rows.filter((item) => item.type === "call").length;

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">{labels.activity.plural}</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Track tasks and touchpoints in one timeline.</p>
      </div>

      <div className="bg-card text-card-foreground rounded-xl border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y divide-x-0 lg:divide-x sm:divide-y-0 divide-border">
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Total {labels.activity.plural}</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{rows.length}</p>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CircleDot className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Tasks</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{taskCount}</p>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <UserCheck className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Notes</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{noteCount}</p>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BellRing className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Calls</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{callCount}</p>
          </div>
        </div>
      </div>

      {user ? <ActivityForm userId={user.id} /> : null}

      <div className="bg-card text-card-foreground rounded-xl border">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between py-3 sm:py-5 px-3 sm:px-5">
          <h2 className="font-medium text-sm sm:text-base">Recent {labels.activity.plural}</h2>
        </div>
        {rows.length === 0 ? (
          <p className="px-3 sm:px-5 pb-4 text-sm text-muted-foreground">No activity logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="bg-muted/50">
                  <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Type</th>
                  <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">Subject</th>
                  <th className="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap">When</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {rows.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors">
                    <td className="p-2 align-middle whitespace-nowrap">
                      <span className="h-5 gap-1 rounded-4xl border border-border px-2 py-0.5 text-xs font-medium inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 bg-secondary text-secondary-foreground">
                        {item.type}
                      </span>
                    </td>
                    <td className="p-2 align-middle whitespace-nowrap text-sm text-foreground">{item.subject ?? "No subject"}</td>
                    <td className="p-2 align-middle whitespace-nowrap text-sm text-muted-foreground">{formatRelativeDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
