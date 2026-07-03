// OAuth consent-screen workspace picker — integration spec against a REAL
// disposable Neon branch (OAuth plan Task 9; design doc §2.5's org_members
// join). Follows this repo's established integration-DB convention
// (tests/integration/rls-phase1.spec.ts): OPT-IN via an env var, skipping
// entirely — with a passing placeholder — when unset, so it never runs (or
// fails) inside the unit suite or CI without a deliberately provided branch.
//
// This spec is NOT picked up by scripts/run-unit-tests.js (which globs
// tests/unit/** only). To run it:
//   cd packages/crm
//   OAUTH_TEST_DATABASE_URL="postgresql://…disposable-branch…?sslmode=require" \
//     node --import tsx --test tests/integration/oauth-workspace-picker.spec.ts
//
// The URL must point at a DISPOSABLE branch (this spec inserts and deletes
// real organizations/users/org_members rows). Migration 0063 is NOT required
// on the branch — listWorkspacesForUser touches only pre-existing tables.
//
// DATABASE_URL override note: src/db/index.ts binds DATABASE_URL at import
// time, so this spec sets process.env.DATABASE_URL BEFORE dynamically
// importing the module under test — static imports of @/db anywhere in this
// file would defeat the override (same reason rls-phase1.spec.ts builds its
// own drizzle instances instead of importing @/db).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const TEST_URL = process.env.OAUTH_TEST_DATABASE_URL;

if (!TEST_URL) {
  describe("OAuth workspace picker integration (SKIPPED)", () => {
    test("set OAUTH_TEST_DATABASE_URL to a disposable Neon branch to run this spec", () => {
      assert.ok(true, "skipped — no OAUTH_TEST_DATABASE_URL in env");
    });
  });
} else {
  process.env.DATABASE_URL = TEST_URL;

  describe("listWorkspacesForUser (integration)", () => {
    test("returns every workspace the user belongs to via org_members", async () => {
      const { db } = await import("../../src/db");
      const { organizations, orgMembers, users } = await import("../../src/db/schema");
      const { listWorkspacesForUser } = await import("../../src/lib/oauth/workspace-picker");
      const { eq, inArray } = await import("drizzle-orm");

      const suffix = crypto.randomUUID().slice(0, 8);
      let orgAId: string | undefined;
      let orgBId: string | undefined;

      try {
        const [orgA] = await db
          .insert(organizations)
          .values({ name: `OAuth Picker Test A ${suffix}`, slug: `oauth-picker-a-${suffix}` })
          .returning({ id: organizations.id });
        const [orgB] = await db
          .insert(organizations)
          .values({ name: `OAuth Picker Test B ${suffix}`, slug: `oauth-picker-b-${suffix}` })
          .returning({ id: organizations.id });
        orgAId = orgA.id;
        orgBId = orgB.id;

        const [user] = await db
          .insert(users)
          .values({
            orgId: orgA.id,
            name: "OAuth Picker Test User",
            email: `oauth-picker-${suffix}@test.invalid`,
          })
          .returning({ id: users.id });

        await db.insert(orgMembers).values([
          { orgId: orgA.id, userId: user.id, role: "owner" },
          { orgId: orgB.id, userId: user.id, role: "member" },
        ]);

        const workspaces = await listWorkspacesForUser(user.id);

        assert.equal(workspaces.length, 2);
        const byOrg = new Map(workspaces.map((w) => [w.orgId, w]));
        assert.equal(byOrg.get(orgA.id)?.name, `OAuth Picker Test A ${suffix}`);
        assert.equal(byOrg.get(orgA.id)?.role, "owner");
        assert.equal(byOrg.get(orgB.id)?.name, `OAuth Picker Test B ${suffix}`);
        assert.equal(byOrg.get(orgB.id)?.role, "member");
      } finally {
        // Deleting the orgs cascades org_members and the user (users.org_id
        // references organizations ON DELETE CASCADE).
        const toDelete = [orgAId, orgBId].filter((v): v is string => Boolean(v));
        if (toDelete.length > 0) {
          await db.delete(organizations).where(inArray(organizations.id, toDelete));
          const leftover = await db
            .select({ id: organizations.id })
            .from(organizations)
            .where(inArray(organizations.id, toDelete));
          assert.equal(leftover.length, 0, "test orgs cleaned up");
        }
        void eq; // silence unused-import lint if cleanup shape changes
      }
    });
  });
}
