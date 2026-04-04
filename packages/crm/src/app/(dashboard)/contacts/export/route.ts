import { and, asc, desc, eq, gte, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

type ContactListSort = "recent" | "name_asc" | "name_desc" | "score_desc" | "score_asc";

function toCsvCell(value: string | null | undefined) {
  const normalized = (value ?? "").replaceAll("\r", " ").replaceAll("\n", " ");
  return `"${normalized.replaceAll("\"", '""')}"`;
}

function startOfWeek(now: Date) {
  const day = now.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const result = new Date(now);
  result.setDate(now.getDate() - daysFromMonday);
  result.setHours(0, 0, 0, 0);
  return result;
}

export async function GET(request: Request) {
  const orgId = await getOrgId();

  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const status = (searchParams.get("status") ?? "all").trim() || "all";
  const sort = (searchParams.get("sort") ?? "recent") as ContactListSort;
  const dateRange = (searchParams.get("dateRange") ?? "all") as "all" | "month" | "week" | "today";

  const now = new Date();
  let createdAfter: Date | undefined;

  if (dateRange === "month") {
    createdAfter = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (dateRange === "week") {
    createdAfter = startOfWeek(now);
  } else if (dateRange === "today") {
    createdAfter = new Date(now);
    createdAfter.setHours(0, 0, 0, 0);
  }

  const conditions = [eq(contacts.orgId, orgId)];

  if (search) {
    const searchCondition = or(
      ilike(contacts.firstName, `%${search}%`),
      ilike(contacts.lastName, `%${search}%`),
      ilike(contacts.email, `%${search}%`),
      ilike(contacts.company, `%${search}%`)
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (status !== "all") {
    conditions.push(eq(contacts.status, status));
  }

  if (createdAfter) {
    conditions.push(gte(contacts.createdAt, createdAfter));
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
  const base = db.select().from(contacts).where(whereClause);

  let rows;

  switch (sort) {
    case "name_asc":
      rows = await base.orderBy(asc(contacts.firstName), asc(contacts.lastName), desc(contacts.createdAt));
      break;
    case "name_desc":
      rows = await base.orderBy(desc(contacts.firstName), desc(contacts.lastName), desc(contacts.createdAt));
      break;
    case "score_desc":
      rows = await base.orderBy(desc(contacts.score), desc(contacts.createdAt));
      break;
    case "score_asc":
      rows = await base.orderBy(asc(contacts.score), desc(contacts.createdAt));
      break;
    default:
      rows = await base.orderBy(desc(contacts.createdAt));
      break;
  }

  const header = ["First Name", "Last Name", "Email", "Phone", "Stage", "Created On"];
  const body = rows.map((row) => [
    row.firstName,
    row.lastName,
    row.email,
    row.phone,
    row.status,
    row.createdAt ? new Date(row.createdAt).toISOString() : "",
  ]);

  const csv = [header, ...body]
    .map((line) => line.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
