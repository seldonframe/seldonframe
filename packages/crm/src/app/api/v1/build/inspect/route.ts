// POST /api/v1/build/inspect — inspect a catalog entry (spec 1ff09dcb, P1 Task 2).
//
// The Monid-shaped `inspect` step: { type, id } → { id, type, name, description,
// inputSchema, price, docUrl? }. For an AGENT (id = listing slug) we resolve the
// published listing + its blueprint and synthesize the run envelope schema. For
// a TOOL (id = Composio action slug) we resolve its toolkit, open a Composio
// session for the renter's org, and read the action's REAL input schema via the
// codebase's own MCP client (createMcpClient(...).listTools()) — the established,
// version-stable schema source. If Composio isn't configured (no key → no
// session) or the action can't be found, we fall soft to a permissive schema so
// inspect still returns the Monid shape (and stays inert without keys).
//
// Read-only. No money moves here.

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema/marketplace";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import {
  agentListingToCatalogEntry,
  composioToolToCatalogEntry,
  type CatalogEntry,
} from "@/lib/build/discover";
import { buildInspectView, type InspectSource, type JsonSchema } from "@/lib/build/inspect";
import { COMPOSIO_TOOLKITS, defaultToolsForToolkits } from "@/lib/integrations/composio/catalog";

type Body = { type?: unknown; id?: unknown };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardApiRequest(request);
  if (guard.error) return guard.error;
  if (!guard.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = guard.orgId;

  const body = (await request.json().catch(() => ({}))) as Body;
  const type = str(body.type);
  const id = str(body.id);

  if (type !== "agent" && type !== "tool") {
    return NextResponse.json({ error: 'type must be "agent" or "tool".' }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const source =
    type === "agent" ? await resolveAgentSource(id) : await resolveToolSource(id);

  if (!source) {
    return NextResponse.json(
      { error: type === "agent" ? "No published agent with that id." : "Unknown tool id." },
      { status: 404 },
    );
  }

  const view = buildInspectView(source);

  logEvent("build_inspect", { type, id, schema_source: source.type === "tool" ? (source.inputSchema ? "live" : "fallback") : "agent" }, { request, orgId, status: 200 });

  return NextResponse.json(view);
}

// ── agents ────────────────────────────────────────────────────────────────────
async function resolveAgentSource(slug: string): Promise<InspectSource | null> {
  const [row] = await db
    .select({
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      description: marketplaceListings.description,
      priceModel: marketplaceListings.priceModel,
      price: marketplaceListings.price,
      perCallPriceCents: marketplaceListings.perCallPriceCents,
      perOutcomePriceCents: marketplaceListings.perOutcomePriceCents,
      outcomeType: marketplaceListings.outcomeType,
      kind: marketplaceListings.kind,
      agentBlueprint: marketplaceListings.agentBlueprint,
    })
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), eq(marketplaceListings.isPublished, true)))
    .limit(1);

  if (!row || row.kind !== "agent") return null;

  const entry: CatalogEntry = agentListingToCatalogEntry({
    slug: row.slug,
    name: row.name,
    description: row.description,
    priceModel: row.priceModel,
    price: row.price,
    perCallPriceCents: row.perCallPriceCents,
    perOutcomePriceCents: row.perOutcomePriceCents,
    outcomeType: row.outcomeType,
  });

  const capabilities = Array.isArray(row.agentBlueprint?.capabilities)
    ? (row.agentBlueprint.capabilities as string[])
    : [];

  return {
    type: "agent",
    id: entry.id,
    name: entry.name,
    description: entry.description,
    price: entry.price,
    capabilities,
  };
}

// ── tools ─────────────────────────────────────────────────────────────────────

/** Find the curated toolkit that owns an action slug (e.g. GMAIL_SEND_EMAIL →
 *  gmail), via the action's TOOLKIT_ prefix matched against the catalog. */
function toolkitForAction(actionSlug: string): string | null {
  const upper = actionSlug.toUpperCase();
  for (const tk of COMPOSIO_TOOLKITS) {
    if (upper.startsWith(`${tk.slug.toUpperCase()}_`)) return tk.slug;
  }
  return null;
}

/** True iff the action is one of the curated default actions for its toolkit. */
function isKnownAction(toolkitSlug: string, actionSlug: string): boolean {
  return defaultToolsForToolkits([toolkitSlug]).includes(actionSlug);
}

async function resolveToolSource(actionSlug: string): Promise<InspectSource | null> {
  const toolkit = toolkitForAction(actionSlug);
  if (!toolkit || !isKnownAction(toolkit, actionSlug)) return null;

  const entry = composioToolToCatalogEntry(toolkit, actionSlug);

  // P1 returns a permissive input schema for tools (run still works — Composio
  // validates server-side) + a docUrl to the real per-field reference. The rich
  // per-action JSON Schema is a deliberate follow-on: the per-workspace Composio
  // MCP session runs in TOOL-ROUTER mode (its tools/list exposes only meta-tools,
  // NOT the direct action — see lib/integrations/composio/connector.ts), so the
  // real schema needs the SDK raw-tools getter, which this codebase doesn't yet
  // wire. Permissive-now keeps inspect honest, fast, and inert without keys.
  const inputSchema: JsonSchema = { type: "object", properties: {}, additionalProperties: true };

  return {
    type: "tool",
    id: entry.id,
    provider: entry.provider,
    name: entry.name,
    description: entry.description,
    price: entry.price,
    inputSchema,
    docUrl: `https://docs.composio.dev/toolkits/${toolkit}`,
  };
}
