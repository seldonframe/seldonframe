import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * landing_payload_versions — immutable snapshot log for R1 landing payloads.
 *
 * Every edit (natural-language instruction via /api/v1/landing/r1/customize)
 * and every revert (/api/v1/landing/r1/revert) inserts a new row. Rows are
 * NEVER deleted. The "current" payload lives in landing_pages.blueprintJson;
 * this table gives operators a full undo history.
 *
 * A row captures the payload BEFORE the instruction was applied so that
 * "undo to here" can restore an earlier state by creating a new row with
 * the target payload as the snapshot and updating landing_pages.blueprintJson.
 *
 * The initial auto-generated payload also gets a row with instruction=null
 * and summary="Initial auto-generated R1 landing".
 */
export const landingPayloadVersions = pgTable(
  "landing_payload_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Full R1LandingPayload snapshot at this version point. */
    payload: jsonb("payload").notNull(),
    /** The natural-language instruction that produced this version. Null for the
     *  initial auto-generated version or for internal system operations. */
    instruction: text("instruction"),
    /** LLM's 1-sentence past-tense summary of what changed. */
    summary: text("summary"),
    /** User who triggered the edit. Null for system-generated initial versions. */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("landing_payload_versions_workspace_idx").on(t.workspaceId, t.createdAt),
  ]
);
