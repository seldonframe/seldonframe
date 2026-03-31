import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { BUILT_IN_BLOCKS } from "@seldonframe/core/blocks";
import { db } from "@/db";
import { marketplaceBlocks, organizations, stripeConnections, type OrganizationIntegrations } from "@/db/schema";
import type { OrgSoul } from "@/lib/soul/types";

type SnapshotColumn = {
  name: string;
  type: string;
};

type SnapshotForeignKey = {
  tableFrom: string;
  tableTo: string;
  columnsFrom: string[];
  columnsTo: string[];
};

type SnapshotTable = {
  name: string;
  columns: Record<string, SnapshotColumn>;
  foreignKeys?: Record<string, SnapshotForeignKey>;
};

type DrizzleSnapshot = {
  tables: Record<string, SnapshotTable>;
};

function resolveLatestSnapshotPath() {
  const baseDirs = [
    join(process.cwd(), "drizzle", "meta"),
    join(process.cwd(), "packages", "crm", "drizzle", "meta"),
  ];

  for (const baseDir of baseDirs) {
    if (!existsSync(baseDir)) {
      continue;
    }

    const snapshotFile = readdirSync(baseDir)
      .filter((fileName) => /^\d+_snapshot\.json$/.test(fileName))
      .sort()
      .at(-1);

    if (snapshotFile) {
      return join(baseDir, snapshotFile);
    }
  }

  return null;
}

function readIntegrations(raw: unknown): OrganizationIntegrations {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  return raw as OrganizationIntegrations;
}

export async function getCompressedSchema() {
  const snapshotPath = resolveLatestSnapshotPath();

  if (!snapshotPath) {
    return "Schema snapshot unavailable.";
  }

  const raw = readFileSync(snapshotPath, "utf8");
  const snapshot = JSON.parse(raw) as DrizzleSnapshot;
  const tables = Object.values(snapshot.tables).sort((a, b) => a.name.localeCompare(b.name));

  return tables
    .map((table) => {
      const columns = Object.values(table.columns).map((column) => `${column.name}(${column.type})`);
      const foreignKeys = Object.values(table.foreignKeys ?? {}).map(
        (fk) => `${fk.tableFrom}.${fk.columnsFrom.join("+")}→${fk.tableTo}.${fk.columnsTo.join("+")}`
      );

      const relationSuffix = foreignKeys.length > 0 ? ` | fk: ${foreignKeys.join("; ")}` : "";
      return `${table.name}: ${columns.join(", ")}${relationSuffix}`;
    })
    .join("\n");
}

export async function assembleBlockContext(orgId: string): Promise<string> {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      soul: organizations.soul,
      enabledBlocks: organizations.enabledBlocks,
      integrations: organizations.integrations,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const soul = (org.soul as OrgSoul | null) ?? null;
  const integrations = readIntegrations(org.integrations);

  const enabledBlockIds = Array.isArray(org.enabledBlocks) && org.enabledBlocks.length > 0 ? org.enabledBlocks : BUILT_IN_BLOCKS.map((block) => block.id);

  const builtInMap = new Map(BUILT_IN_BLOCKS.map((block) => [block.id, block]));
  const enabledBuiltIns = enabledBlockIds
    .map((id) => builtInMap.get(id))
    .filter((block): block is (typeof BUILT_IN_BLOCKS)[number] => Boolean(block));
  const marketplaceIds = enabledBlockIds.filter((id) => !builtInMap.has(id));

  const marketplaceEnabled = marketplaceIds.length
    ? await db
        .select({ blockId: marketplaceBlocks.blockId, name: marketplaceBlocks.name, description: marketplaceBlocks.description })
        .from(marketplaceBlocks)
        .where(inArray(marketplaceBlocks.blockId, marketplaceIds))
    : [];

  const [stripeConnection] = await db
    .select({ stripeAccountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(eq(stripeConnections.orgId, orgId))
    .limit(1);

  const allEvents = Array.from(
    new Set(
      BUILT_IN_BLOCKS.flatMap((block) => {
        return [...block.events.emits, ...block.events.listens];
      })
    )
  ).sort();

  const installedBlockLines = [
    ...enabledBuiltIns.map((block) => `- ${block.name}: ${block.description} (events: ${block.events.emits.join(", ") || "none"})`),
    ...marketplaceEnabled.map((block) => `- ${block.name || block.blockId}: ${block.description || "Marketplace block"} (events: custom)`),
  ];

  const services: string[] = [];
  if (integrations.twilio?.connected) services.push("Twilio SMS (connected)");
  if (integrations.resend?.connected) services.push("Resend Email (connected)");
  if (integrations.kit?.connected) services.push("Kit/ConvertKit (connected)");
  if (integrations.google?.calendarConnected) services.push("Google Calendar (connected)");
  if (stripeConnection?.stripeAccountId) services.push("Stripe Connect (connected)");

  const soulContext = soul
    ? `## Soul Configuration
Business Name: ${soul.businessName || org.name}
Entity Labels:
- Contact: ${soul.entityLabels?.contact?.singular || "Contact"} / ${soul.entityLabels?.contact?.plural || "Contacts"}
- Deal: ${soul.entityLabels?.deal?.singular || "Deal"} / ${soul.entityLabels?.deal?.plural || "Deals"}
- Activity: ${soul.entityLabels?.activity?.singular || "Activity"} / ${soul.entityLabels?.activity?.plural || "Activities"}
Voice: ${soul.voice?.style || "professional and friendly"}
Vocabulary: ${soul.voice?.vocabulary?.join(", ") || "none specified"}
Avoid words: ${soul.voice?.avoidWords?.join(", ") || "none specified"}
Pipeline stages: ${soul.pipeline?.stages?.map((stage) => stage.name).join(" → ") || "not configured"}`
    : "## Soul: Not configured yet";

  const schemaCompressed = await getCompressedSchema();

  return `${soulContext}

## Installed Blocks
${installedBlockLines.join("\n") || "Only built-in blocks (CRM, Booking, Email, Forms, Payments)"}

## Connected Services
${services.length > 0 ? services.join("\n") : "No external services connected yet"}

## Available Events (can listen to or emit)
${allEvents.join(", ")}

## Database Schema (tables and relationships)
${schemaCompressed}

## Page Pattern (follow this for all new pages)
- Server components for data fetching, "use client" for interactive elements
- Layout: glass-card containers with rounded-2xl and p-6
- Colors: bg-background, text-foreground, border (Tailwind tokens only)
- Labels: use soul labels (labels.contact.plural, labels.deal.plural, etc.)
- Empty state: centered icon + soul-labeled message + CTA button
- Lists: card grid (grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6)
- Status badges: teal bg for active, amber for pending, muted for draft
- All data queries filter by orgId (never return cross-org data)

## Server Action Pattern (follow this for all mutations)
- "use server" directive at top of file
- Validate orgId on every operation
- Use db.insert/update/delete with Drizzle
- Call revalidatePath after mutations
- Emit events via emitEvent({ type: "entity.action", orgId, payload })
- Return { success: true } or throw descriptive errors

## Schema Pattern (follow this for all new tables)
- Every table: orgId text("org_id").notNull()
- Primary key: id uuid("id").primaryKey().defaultRandom()
- Timestamps: createdAt timestamp("created_at").defaultNow().notNull()
- Foreign keys: use uuid type, reference by id
- Use text for strings, numeric(10,2) for money, jsonb for flexible data
- Add index on orgId for every table

## Integration Patterns
When using Twilio SMS:
- Read credentials from org.integrations.twilio
- Send from org.integrations.twilio.fromNumber
- Log SMS outcomes as timeline activity
- Handle errors for invalid number or credentials

When using Resend Email:
- Read credentials from org.integrations.resend
- Apply soul voice to generated email content
- from: org.integrations.resend.fromName <org.integrations.resend.fromEmail>

When using Kit/ConvertKit:
- Read credentials from org.integrations.kit
- Base URL: https://api.kit.com/v4
- Headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" }
- Rate limit: 120 requests per 60 seconds

When using Stripe:
- Use stripe_connections for org-level account linkage
- Apply connected account context on Connect API calls
- Amounts are cents for Stripe API calls

When using scheduled/delayed actions:
- Create a Next.js API route: /api/cron/[blockId]
- Ensure cron handlers are idempotent
- For v1, run batch processing per cron cycle`;
}
