// src/lib/operator-portal/search.ts
// NOT "use server" — the action wrapper is search-actions.ts.
import { ilike, or, eq, and, ne } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, bookings } from "@/db/schema";

export type UniversalSearchResult = {
  type: "contact" | "deal" | "booking";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  score: number;
};

export type SearchQueryDeps = {
  queryContacts: (orgId: string, q: string) => Promise<Array<{ id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null; company: string | null }>>;
  queryDeals: (orgId: string, q: string) => Promise<Array<{ id: string; title: string; stage: string; value: string }>>;
  queryBookings: (orgId: string, q: string) => Promise<Array<{ id: string; title: string; fullName: string | null; startsAt: Date }>>;
};

/** Assign a score based on match quality (exact=3, prefix=2, substring=1, none=0). */
function scoreTitle(query: string, title: string): number {
  const q = query.toLowerCase().trim();
  const t = title.toLowerCase().trim();
  if (!q) return 0;
  if (t === q) return 3;
  if (t.startsWith(q)) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

const TYPE_ORDER: Record<string, number> = { contact: 0, deal: 1, booking: 2 };

/** Pure ranking: filter to matches, score, sort by (score desc, type asc). */
export function rankResults(query: string, results: UniversalSearchResult[]): UniversalSearchResult[] {
  if (!query.trim()) return [];

  return results
    .map((r) => {
      const titleScore = scoreTitle(query, r.title);
      const subtitleScore = scoreTitle(query, r.subtitle) * 0.5; // subtitle counts for half
      return { ...r, score: Math.max(titleScore, subtitleScore) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    });
}

function defaultDeps(orgSlug: string): SearchQueryDeps {
  const pat = (q: string) => `%${q}%`;
  return {
    queryContacts: async (orgId, q) =>
      db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone, company: contacts.company })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), or(ilike(contacts.firstName, pat(q)), ilike(contacts.lastName, pat(q)), ilike(contacts.email, pat(q)), ilike(contacts.phone, pat(q)), ilike(contacts.company, pat(q)))))
        .limit(10),
    queryDeals: async (orgId, q) =>
      db.select({ id: deals.id, title: deals.title, stage: deals.stage, value: deals.value })
        .from(deals)
        .where(and(eq(deals.orgId, orgId), ilike(deals.title, pat(q))))
        .limit(10),
    queryBookings: async (orgId, q) =>
      db.select({ id: bookings.id, title: bookings.title, fullName: bookings.fullName, startsAt: bookings.startsAt })
        .from(bookings)
        .where(and(eq(bookings.orgId, orgId), ne(bookings.status, "template"), or(ilike(bookings.title, pat(q)), ilike(bookings.fullName, pat(q)))))
        .limit(10),
  };
}

export async function universalSearch(
  params: { orgId: string; query: string; limit?: number; orgSlug: string },
  deps: SearchQueryDeps = defaultDeps(params.orgSlug)
): Promise<UniversalSearchResult[]> {
  const q = params.query.trim();
  if (!q || q.length < 2) return [];

  const [contactRows, dealRows, bookingRows] = await Promise.all([
    deps.queryContacts(params.orgId, q),
    deps.queryDeals(params.orgId, q),
    deps.queryBookings(params.orgId, q),
  ]);

  const base = `/portal/${params.orgSlug}`;

  const raw: UniversalSearchResult[] = [
    ...contactRows.map((c) => ({
      type: "contact" as const,
      id: c.id,
      title: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone || c.email || "Unknown",
      subtitle: c.email ?? c.phone ?? "",
      href: `${base}/messages/${c.id}`,
      score: 0,
    })),
    ...dealRows.map((d) => ({
      type: "deal" as const,
      id: d.id,
      title: d.title,
      subtitle: `${d.stage} · $${Number(d.value).toLocaleString()}`,
      href: `${base}/leads`,
      score: 0,
    })),
    ...bookingRows.map((b) => ({
      type: "booking" as const,
      id: b.id,
      title: b.title,
      subtitle: b.fullName ?? "",
      href: `${base}/appointments`,
      score: 0,
    })),
  ];

  const ranked = rankResults(q, raw);
  return ranked.slice(0, params.limit ?? 20);
}
