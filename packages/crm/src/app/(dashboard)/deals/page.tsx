import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getLabels } from "@/lib/soul/labels";
import { listDeals } from "@/lib/deals/actions";
import { Building2, Filter, Search, Target, TrendingUp, DollarSign } from "lucide-react";

function compactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; value?: string; search?: string }>;
}) {
  const params = await searchParams;
  const selectedStage = (params.stage ?? "all").trim() || "all";
  const selectedValue = (params.value ?? "all").trim() || "all";
  const search = (params.search ?? "").trim();

  const [labels, dealRows, orgId] = await Promise.all([
    getLabels(),
    listDeals(),
    getOrgId(),
  ]);

  const contactRows = orgId
    ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.orgId, orgId))
    : [];

  const contactById = new Map(contactRows.map((contact) => [contact.id, `${contact.firstName} ${contact.lastName ?? ""}`.trim()]));

  const filteredDeals = dealRows.filter((deal) => {
    const contactName = contactById.get(deal.contactId) ?? "";
    const searchMatch =
      search.length === 0 ||
      deal.title.toLowerCase().includes(search.toLowerCase()) ||
      deal.stage.toLowerCase().includes(search.toLowerCase()) ||
      contactName.toLowerCase().includes(search.toLowerCase());

    const stageMatch = selectedStage === "all" || deal.stage === selectedStage;

    const numericValue = Number(deal.value || 0);
    const valueMatch =
      selectedValue === "all"
        ? true
        : selectedValue === "under10k"
          ? numericValue < 10000
          : selectedValue === "10k-50k"
            ? numericValue >= 10000 && numericValue <= 50000
            : numericValue > 50000;

    return searchMatch && stageMatch && valueMatch;
  });

  const totalValue = filteredDeals.reduce((sum, row) => sum + Number(row.value), 0);
  const wonCount = filteredDeals.filter((row) => row.probability === 100 || row.stage.toLowerCase().includes("won")).length;
  const winRate = filteredDeals.length ? Math.round((wonCount / filteredDeals.length) * 100) : 0;

  const stageBuckets = Array.from(
    filteredDeals.reduce((acc, deal) => {
      const key = deal.stage;
      const current = acc.get(key) ?? { stage: key, count: 0, value: 0 };
      current.count += 1;
      current.value += Number(deal.value || 0);
      acc.set(key, current);
      return acc;
    }, new Map<string, { stage: string; count: number; value: number }>()).values()
  ).sort((a, b) => b.value - a.value);

  const maxStageValue = Math.max(...stageBuckets.map((bucket) => bucket.value), 1);

  const availableStages = Array.from(new Set(dealRows.map((deal) => deal.stage))).sort((a, b) => a.localeCompare(b));

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-4 sm:p-6 space-y-6 bg-background w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
        <div className="space-y-2">
          <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Engagements</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Track and move {labels.deal.plural.toLowerCase()} through your pipeline.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card text-card-foreground rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Pipeline Value</span>
            <DollarSign className="size-4 text-muted-foreground" />
          </div>
          <div className="bg-muted/50 border rounded-lg p-4">
            <span className="text-2xl sm:text-3xl font-medium tracking-tight">{compactCurrency(totalValue)}</span>
          </div>
        </div>

        <div className="bg-card text-card-foreground rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Active {labels.deal.plural}</span>
            <Building2 className="size-4 text-muted-foreground" />
          </div>
          <div className="bg-muted/50 border rounded-lg p-4">
            <span className="text-2xl sm:text-3xl font-medium tracking-tight">{filteredDeals.length}</span>
          </div>
        </div>

        <div className="bg-card text-card-foreground rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Win Rate</span>
            <Target className="size-4 text-muted-foreground" />
          </div>
          <div className="bg-muted/50 border rounded-lg p-4">
            <span className="text-2xl sm:text-3xl font-medium tracking-tight">{winRate}%</span>
          </div>
        </div>

        <div className="bg-card text-card-foreground rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Won Deals</span>
            <TrendingUp className="size-4 text-muted-foreground" />
          </div>
          <div className="bg-muted/50 border rounded-lg p-4">
            <span className="text-2xl sm:text-3xl font-medium tracking-tight">{wonCount}</span>
          </div>
        </div>
      </div>

      <div className="bg-card text-card-foreground rounded-lg border p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="font-medium text-sm sm:text-base">Deal Value by Stage</h3>
        </div>
        <div className="space-y-3">
          {stageBuckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stage data available.</p>
          ) : (
            stageBuckets.map((bucket) => (
              <div key={bucket.stage} className="space-y-1">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-foreground">{bucket.stage}</span>
                  <span className="text-muted-foreground">{compactCurrency(bucket.value)} · {bucket.count}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-linear-to-r from-[#ec4899] to-[#06b6d4]" style={{ width: `${Math.max(8, (bucket.value / maxStageValue) * 100)}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-card text-card-foreground rounded-xl border">
        <form method="get" className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between px-4 sm:px-5 py-3 sm:py-4 border-b">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input name="search" defaultValue={search} className="crm-input pl-9 h-9 w-full sm:w-[220px]" placeholder="Search deals..." />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <select name="stage" defaultValue={selectedStage} className="crm-input h-9 w-[160px] pl-9 pr-3">
                <option value="all">All Stages</option>
                {availableStages.map((stage) => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>

            <select name="value" defaultValue={selectedValue} className="crm-input h-9 w-[160px] px-3">
              <option value="all">All Values</option>
              <option value="under10k">Under $10k</option>
              <option value="10k-50k">$10k - $50k</option>
              <option value="over50k">Over $50k</option>
            </select>

            <button type="submit" className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground">
              Apply
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[200px]">Title</th>
                <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[180px]">Contact</th>
                <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[120px]">Stage</th>
                <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[120px]">Value</th>
                <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[110px]">Probability</th>
                <th className="h-10 px-3 text-left align-middle font-medium whitespace-nowrap min-w-[140px]">Created Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
                        <Building2 className="size-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">No deals found.</p>
                      <Link href="/deals" className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-sm text-background transition-colors hover:bg-foreground/90">
                        Create your first engagement
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDeals
                  .sort((a, b) => Number(b.value) - Number(a.value))
                  .map((deal) => {
                    const contactName = contactById.get(deal.contactId) || labels.contact.singular;
                    const createdAt = new Date(deal.createdAt);
                    const createdDate = Number.isNaN(createdAt.getTime())
                      ? "—"
                      : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(createdAt);
                    return (
                      <tr key={deal.id} className="border-b transition-colors hover:bg-muted/30">
                        <td className="p-3 align-middle whitespace-nowrap">
                          <Link href={`/deals/${deal.id}`} className="font-medium hover:underline">{deal.title}</Link>
                        </td>
                        <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">{contactName}</td>
                        <td className="p-3 align-middle whitespace-nowrap">
                          <span className="inline-flex rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{deal.stage}</span>
                        </td>
                        <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">{compactCurrency(Number(deal.value))}</td>
                        <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">{deal.probability}%</td>
                        <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">{createdDate}</td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
