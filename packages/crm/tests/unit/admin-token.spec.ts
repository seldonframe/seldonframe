import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_TOKEN_COOKIE,
  ACTIVE_ORG_COOKIE,
  ADMIN_TOKEN_COOKIE_MAX_AGE,
  adminTokenUserId,
  isAdminTokenUserId,
} from "@/lib/auth/admin-token";
import { buildStructuredWorkspaceUrls } from "@/lib/billing/anonymous-workspace";

// ─── admin-token cookie module ─────────────────────────────────────────

test("ADMIN_TOKEN_COOKIE_MAX_AGE matches 7-day token policy", () => {
  // The cookie expiry must match the bearer token expiry (7 days set
  // by createAnonymousWorkspace) so the browser stops sending the cookie
  // once the server would have rejected it anyway. Drift here would
  // produce a mismatch where the cookie is still sent after the token
  // is invalid — wasteful, and confusing for the operator.
  assert.equal(ADMIN_TOKEN_COOKIE_MAX_AGE, 7 * 24 * 60 * 60);
});

test("admin-token cookie names are stable strings (server + middleware coordination)", () => {
  // These cookie names are read in `helpers.ts` (resolveAdminTokenContext)
  // and written in `/admin/[workspaceId]/route.ts`. A typo on either
  // side breaks the round-trip silently — pin both via constants and
  // test the names so a refactor surfaces here.
  assert.equal(ADMIN_TOKEN_COOKIE, "sf_admin_token");
  assert.equal(ACTIVE_ORG_COOKIE, "sf_active_org_id");
});

test("adminTokenUserId returns the nil UUID sentinel (RFC 4122 § 4.1.7)", () => {
  // Earlier iterations used "__sf_admin_token__:<orgId>" but Postgres uuid
  // columns reject that shape — the dashboard does
  // `WHERE organizations.ownerId = user.id` directly and 500'd on
  // "invalid input syntax for type uuid". The nil UUID is reserved so
  // it returns empty rows, which is exactly what we want.
  assert.equal(adminTokenUserId("any-org-id"), "00000000-0000-0000-0000-000000000000");
  assert.equal(adminTokenUserId("00000000-0000-0000-0000-000000000abc"), "00000000-0000-0000-0000-000000000000");
});

test("isAdminTokenUserId detects sentinel ids", () => {
  assert.equal(isAdminTokenUserId(adminTokenUserId("xyz")), true);
  assert.equal(isAdminTokenUserId("00000000-0000-0000-0000-000000000000"), true);
  assert.equal(isAdminTokenUserId(null), false);
  assert.equal(isAdminTokenUserId(undefined), false);
  assert.equal(isAdminTokenUserId(""), false);
  // Real UUIDs must not be misclassified
  assert.equal(isAdminTokenUserId("11111111-2222-3333-4444-555555555555"), false);
});

// ─── structured-URL builder (admin URL composition) ───────────────────

test("buildStructuredWorkspaceUrls — emits admin_url when bearerToken supplied", () => {
  const out = buildStructuredWorkspaceUrls(
    "lonestar-hvac",
    "app.seldonframe.com",
    "11111111-2222-3333-4444-555555555555",
    { bearerToken: "wst_FAKE_TOKEN_FOR_TESTING_ONLY_xxxxx" }
  );
  assert.ok(out.admin_url, "admin_url present when bearer token supplied");
  assert.ok(
    out.admin_url!.includes("/admin/11111111-2222-3333-4444-555555555555"),
    "admin_url contains the workspace id"
  );
  assert.ok(
    out.admin_url!.includes("token=wst_FAKE_TOKEN_FOR_TESTING_ONLY_xxxxx"),
    "admin_url carries the bearer token as ?token query"
  );
});

test("buildStructuredWorkspaceUrls — admin_url is null without a bearer token (read-only paths)", () => {
  const out = buildStructuredWorkspaceUrls("acme", "app.seldonframe.com", "abc");
  assert.equal(out.admin_url, null, "no admin URL without a fresh token");
  // The legacy switch-workspace URLs still ship — useful once the operator
  // signs up and runs link_workspace_owner.
  assert.ok(out.admin_urls.dashboard.includes("/switch-workspace"));
});

test("buildStructuredWorkspaceUrls — admin URL host is the canonical app.seldonframe.com", () => {
  const out = buildStructuredWorkspaceUrls(
    "x",
    "ignored.example.com",
    "abc-id",
    { bearerToken: "wst_t" }
  );
  // Public URLs use the per-workspace base domain (acme.app.seldonframe.com)
  // but admin URLs are always on the canonical app host so a single
  // bookmark works regardless of subdomain customization.
  assert.ok(out.public_urls.home.startsWith("https://x.ignored.example.com"));
  assert.ok(out.admin_url!.startsWith("https://app.seldonframe.com/admin/"));
});

test("buildStructuredWorkspaceUrls — admin_setup_note adapts when admin_url is present", () => {
  const withToken = buildStructuredWorkspaceUrls("x", "app.seldonframe.com", "abc", {
    bearerToken: "wst_t",
  });
  const withoutToken = buildStructuredWorkspaceUrls("x", "app.seldonframe.com", "abc");
  assert.ok(
    withToken.admin_setup_note.includes("admin_url"),
    "with-token note tells the operator to use admin_url"
  );
  assert.ok(
    withoutToken.admin_setup_note.includes("link_workspace_owner"),
    "without-token note falls back to legacy signup flow"
  );
});

test("buildStructuredWorkspaceUrls — workspace id + token are URL-encoded in admin_url", () => {
  // Reasonable defense in depth: even though the inputs are normally
  // safe (UUIDs and base64url tokens), we should be encoding them so
  // future changes to ID formats don't introduce URL-injection bugs.
  const out = buildStructuredWorkspaceUrls(
    "x",
    "app.seldonframe.com",
    "weird id with spaces",
    { bearerToken: "token with spaces" }
  );
  assert.ok(
    out.admin_url!.includes("weird%20id%20with%20spaces"),
    "workspace id encoded"
  );
  assert.ok(
    out.admin_url!.includes("token=token%20with%20spaces"),
    "token encoded"
  );
});
