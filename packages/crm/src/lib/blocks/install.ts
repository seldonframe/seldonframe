import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";

export type EnableWorkspaceBlockResult = {
  orgId: string;
  slug: string;
  alreadyEnabled: boolean;
  enabledBlocks: string[];
};

// Idempotent block enable + settings merge, using atomic SQL so concurrent
// installs on different blocks / different settings subtrees don't clobber
// each other.
//
// `alreadyEnabled` is computed from a pre-read — under heavy contention the
// flag may race (two concurrent installs of the same block may both see
// `alreadyEnabled: false`), but the actual stored state is consistent.
export async function enableWorkspaceBlock(
  orgId: string,
  blockSlug: string,
  config?: Record<string, unknown>
): Promise<EnableWorkspaceBlockResult> {
  const [current] = await db
    .select({
      slug: organizations.slug,
      enabledBlocks: organizations.enabledBlocks,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!current) {
    throw new Error(`Workspace ${orgId} not found.`);
  }

  const alreadyEnabled = (current.enabledBlocks ?? []).includes(blockSlug);

  const hasConfig = config && Object.keys(config).length > 0;
  const configPayload = hasConfig
    ? JSON.stringify({ ...config, installed_at: new Date().toISOString() })
    : null;

  // Atomic update:
  //   - enabled_blocks: idempotent append (array_append only when not present).
  //   - settings.blocks.<slug>: jsonb_set merging config; only touched when
  //     config is provided.
  // Under concurrent calls for *different* blocks, both writes succeed because
  // jsonb_set targets distinct paths. Postgres's row-level lock on UPDATE
  // serializes writes to the same row, so the second writer re-reads the
  // committed state. For the SAME block concurrently, the last writer wins on
  // the config payload, which is fine.
  //
  // Path is passed as text[] (bound parameter) rather than sql.raw literal to
  // avoid injection via blockSlug, even though callers today are trusted.
  const enabledBlocksSql = sql`
    CASE
      WHEN ${blockSlug} = ANY(COALESCE(${organizations.enabledBlocks}, ARRAY[]::text[]))
      THEN ${organizations.enabledBlocks}
      ELSE array_append(COALESCE(${organizations.enabledBlocks}, ARRAY[]::text[]), ${blockSlug})
    END
  ` as unknown as string[];

  const settingsSql = configPayload
    ? (sql`
        jsonb_set(
          jsonb_set(
            COALESCE(${organizations.settings}, '{}'::jsonb),
            ARRAY['blocks']::text[],
            COALESCE(${organizations.settings} -> 'blocks', '{}'::jsonb),
            true
          ),
          ARRAY['blocks', ${blockSlug}]::text[],
          COALESCE(${organizations.settings} -> 'blocks' -> ${blockSlug}, '{}'::jsonb) || ${configPayload}::jsonb,
          true
        )
      ` as unknown as typeof organizations.$inferInsert.settings)
    : undefined;

  const [updated] = await db
    .update(organizations)
    .set(
      settingsSql
        ? {
            enabledBlocks: enabledBlocksSql,
            settings: settingsSql,
            updatedAt: new Date(),
          }
        : {
            enabledBlocks: enabledBlocksSql,
            updatedAt: new Date(),
          }
    )
    .where(eq(organizations.id, orgId))
    .returning({
      slug: organizations.slug,
      enabledBlocks: organizations.enabledBlocks,
    });

  return {
    orgId,
    slug: updated?.slug ?? current.slug,
    alreadyEnabled,
    enabledBlocks: updated?.enabledBlocks ?? [],
  };
}

// Append an event to organizations.settings.<bag>, capped at keepLast entries.
// Writes via jsonb_set on the specific bag key, so events in other bags
// ("events" vs "seldon_it_events") don't interfere. Within the same bag, a
// burst of concurrent writes may drop at most keepLast-1 entries — acceptable
// for a soft event log.
export async function recordWorkspaceEvent(
  orgId: string,
  event: Record<string, unknown>,
  opts: { bag?: string; keepLast?: number } = {}
): Promise<void> {
  // bag is bound as a text[] path parameter below, but we still whitelist
  // to catch obvious misuse (keys with periods, spaces, etc. would silently
  // create a nested JSONB path).
  const bag = assertBagKey(opts.bag ?? "events");
  const keepLast = Math.max(1, opts.keepLast ?? 50);

  const stamped = JSON.stringify({
    ...event,
    at: new Date().toISOString(),
  });

  // Append new event then truncate to last keepLast. The jsonb_typeof guard
  // ensures we recover from corrupted state (e.g. someone wrote a non-array to
  // the bag key) without 500'ing.
  await db
    .update(organizations)
    .set({
      settings: sql`
        jsonb_set(
          COALESCE(${organizations.settings}, '{}'::jsonb),
          ARRAY[${bag}]::text[],
          (
            SELECT COALESCE(jsonb_agg(tail.elem ORDER BY tail.ord), '[]'::jsonb)
            FROM (
              SELECT elem, ord
              FROM jsonb_array_elements(
                (
                  CASE
                    WHEN jsonb_typeof(${organizations.settings} -> ${bag}) = 'array'
                    THEN ${organizations.settings} -> ${bag}
                    ELSE '[]'::jsonb
                  END
                ) || ${stamped}::jsonb
              ) WITH ORDINALITY AS t(elem, ord)
              ORDER BY ord DESC
              LIMIT ${keepLast}
            ) tail
          ),
          true
        )
      `,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

// Enforce snake_case identifiers. Caller-controlled bag names hit `jsonb_set`
// as a bound text[] parameter, so injection is not possible even with arbitrary
// input — but a bag name with a period would create a nested path, which is
// rarely the intent.
function assertBagKey(key: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/i.test(key)) {
    throw new Error(`Invalid settings bag key: ${key}`);
  }
  return key;
}
