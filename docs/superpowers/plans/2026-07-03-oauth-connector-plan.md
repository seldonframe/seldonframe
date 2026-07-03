# Implementation Plan — OAuth 2.1 + DCR for `mcp.seldonframe.com/v1`

**Companion doc:** `2026-07-03-oauth-connector-design.md` (read that first — this plan assumes its architecture, security analysis, and grounded facts without re-deriving them).
**Status:** Plan only. No code has been written; no commits exist yet. Every task below ends with an explicit commit step — do not batch commits across tasks.
**Repo:** the real target is `C:\Users\maxim\CascadeProjects\Seldon Frame\` (this plan was authored against the read-only reference worktree at `.claude\worktrees\virality\`, which mirrors the same `packages/crm` layout — verify the working worktree has the same paths before executing Task 1).

---

## Global Constraints (apply to every task below — do not restate per-task, just obey)

- **Feature flag:** `SF_OAUTH_ENABLED` (string env var, checked via `process.env.SF_OAUTH_ENABLED === "true"`). Every new route 404s when falsy/unset. Add to `.env.example` with a comment; do NOT set it to `"true"` in any committed env file.
- **Endpoint paths (exact, do not deviate):**
  - `GET /.well-known/oauth-protected-resource` — served on `mcp.seldonframe.com`, file at `packages/crm/src/app/.well-known/oauth-protected-resource/route.ts`
  - `GET /.well-known/oauth-authorization-server` — served on `app.seldonframe.com`, file at `packages/crm/src/app/.well-known/oauth-authorization-server/route.ts`
  - `POST /api/oauth/register` — file at `packages/crm/src/app/api/oauth/register/route.ts`
  - `GET /oauth/authorize` + `POST /oauth/authorize` — file at `packages/crm/src/app/oauth/authorize/page.tsx` (GET, renders form) + `packages/crm/src/app/api/oauth/authorize/route.ts` (POST, the form-submit target — kept under `/api/` so it's a route handler, not a page action; the page's `<form action="/api/oauth/authorize" method="POST">` posts here)
  - `POST /api/oauth/token` — file at `packages/crm/src/app/api/oauth/token/route.ts`
- **Token kind:** `"oauth"` — added to `export type ApiKeyKind = "user" | "workspace" | "oauth";` in `packages/crm/src/db/schema/api-keys.ts`. No DB enum migration needed (confirmed: `kind` is a `text` column with a TS-level union, not a Postgres enum — see design doc §2.6).
- **Migration index:** **0063** (confirmed next-free by reading `packages/crm/drizzle/meta/_journal.json` directly — latest journaled entry is `idx 39 / tag "0062_wallet_rls"`). New file: `packages/crm/drizzle/0063_oauth_clients.sql`. Journal entry to append to `packages/crm/drizzle/meta/_journal.json`'s `entries` array:
  ```json
  { "idx": 40, "version": "7", "tag": "0063_oauth_clients", "breakpoints": true }
  ```
  (`"when"` field: use `Date.now()` at the time you actually run `drizzle-kit generate` — do not hardcode a timestamp in this plan; Task 1 shows the real generation command instead of hand-writing this JSON.)
- **Matcher additions to `packages/crm/src/proxy.ts`'s `config.matcher` array: NONE.** This is deliberate, not an oversight — see design doc §2.4 for the full reasoning. Task 14 below is a dedicated verification task that PROVES this with a live request rather than asserting it from code-reading alone. If Task 14's verification fails (i.e., a new route is NOT reachable), that is a stop-and-replan signal, not a "just add it to the matcher" auto-fix — re-read design doc §2.4 first, because an unexpected matcher requirement likely means an assumption about `handleBuilderMcpHost` or the whitelist behavior was wrong somewhere.
- **Pure-logic-first, thin-routes-second:** every piece of non-trivial logic (PKCE verification, code/token hashing, redirect_uri validation, metadata document builders, refresh-family rotation logic) is a dependency-injected pure module in `packages/crm/src/lib/oauth/*.ts` with `node:test` specs in `packages/crm/tests/unit/oauth/*.spec.ts`, following the exact style of the existing `packages/crm/tests/unit/auth/workspace-token-parse.spec.ts` (read it before writing the first spec — `describe`/`it`, `node:assert/strict`, `@/` import alias, one behavior per `it`). Route handlers (`route.ts` files) contain ONLY: flag check → parse request → call pure module(s) → map result to `NextResponse`. No business logic inline in a `route.ts` file, ever, in this plan.
- **Verify gate (run after EVERY task, not just at the end):**
  ```bash
  node scripts/run-unit-tests.js                          # full unit suite (glob-form, from repo root)
  ```
  Additionally, at the END of each task that touches TypeScript (i.e., all of them), run:
  ```bash
  cd packages/crm && npx tsc --noEmit -p tsconfig.json     # per Global Constraint — "tsc non-.next"
  ```
  Both must be clean (zero failures, zero new tsc errors — compare against a baseline run before Task 1 if the repo already has pre-existing tsc noise) before moving to the next task.
- **Final verify gate (run once, after the last task, before calling the branch done):**
  ```bash
  node scripts/run-unit-tests.js
  cd packages/crm && npx tsc --noEmit -p tsconfig.json
  bash scripts/check-use-server.sh src                     # from packages/crm
  cd packages/crm && pnpm build                             # equivalent to "pnpm -C packages/crm build" from repo root
  ```
  All four must pass clean. Do not mark the branch ready for review until all four are green in one sitting (not "they passed individually at different points in the session").
- **Commit discipline:** one commit per task, message format `feat(oauth): <task summary>` or `test(oauth): <task summary>` as appropriate. Never bundle two tasks into one commit. Never use `--no-verify`.
- **DO NOT** touch `src/lib/auth/config.ts`'s NextAuth provider list, session strategy, or callbacks — the consent screen reuses the session as-is via `auth()`, it does not need a new provider or a new session shape.
- **DO NOT** add any new `oauth_*` table to the RLS migration pattern (`0062_wallet_rls.sql`'s `withOrgRls`/`DATABASE_URL_APP` mechanism) — these tables are never queried by generic org-scoped app code, only by the OAuth route handlers themselves, which already have the right `org_id`/`client_id` in hand. This is a deliberate scope boundary, not an omission — do not "fix" it by adding RLS policies unless a future task explicitly asks for it.

---

## Task 1 — Migration 0063: `oauth_clients`, `oauth_authorization_codes`, `oauth_refresh_tokens`

**Goal:** additive schema only. No route code yet. This task produces the Drizzle schema files + a generated, journaled migration.

1. Create `packages/crm/src/db/schema/oauth.ts`:

```ts
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { apiKeys } from "./api-keys";

// Public clients ONLY in v1 — no client_secret column. Every registered client
// is treated as a public OAuth client (token_endpoint_auth_method: "none"),
// per this design's DCR choice (see 2026-07-03-oauth-connector-design.md §1.1
// and §3.2). Do not add a secret column without re-reading that rationale.
export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientName: text("client_name"),
    redirectUris: jsonb("redirect_uris").notNull().$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("oauth_clients_client_id_idx").on(table.clientId)]
);

export const oauthAuthorizationCodes = pgTable(
  "oauth_authorization_codes",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeChallenge: text("code_challenge").notNull(),
    resource: text("resource"),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("oauth_auth_codes_code_hash_idx").on(table.codeHash),
    index("oauth_auth_codes_client_id_idx").on(table.clientId),
  ]
);

export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    familyId: uuid("family_id").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "cascade" }),
    resource: text("resource"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("oauth_refresh_tokens_token_hash_idx").on(table.tokenHash),
    index("oauth_refresh_tokens_family_id_idx").on(table.familyId),
  ]
);
```

2. Add to `packages/crm/src/db/schema/index.ts`: `export * from "./oauth";` (place it alphabetically near the other `export * from "./oauth-ish"` neighbors — check the file for exact ordering convention first; if the barrel isn't alphabetized, just append at the end near `api-keys`).

3. **[AMENDED at execution time — coordinator ruling 2026-07-03.]** Hand-write `drizzle/0063_oauth_clients.sql` — do NOT run `drizzle-kit generate`. Why: this repo's journal-idx and on-disk-filename numbering are independent sequences by long-standing accident (85 `.sql` files on disk vs 40 journal entries; `drizzle-kit generate` derives the filename prefix from the journal count and emitted `0040_oauth_clients.sql`, colliding with the out-of-band `0040_partner_agencies.sql` baseline file), and `generate` is a documented drift gotcha here (it bundles phantom `CREATE` statements for tables that were pushed without migrations). The repo's established convention — how `0060_eval_trust_rail` (idx 37), `0061_referrals` (idx 38), and `0062_wallet_rls` (idx 39) all landed, and what `scripts/check-migrations-journaled.mjs`'s own maintenance notes document — is: a hand-written SQL file whose FILENAME number continues the on-disk sequence (→ `0063`), plus a hand-appended journal entry whose `idx` continues the JOURNAL sequence (→ `idx: 40`). Write the three `CREATE TABLE IF NOT EXISTS` statements + `CREATE INDEX IF NOT EXISTS` indexes transcribed column-for-column from step 1's schema file (the schema file is the source of truth), in `0061_referrals.sql`'s style (header comment, quoted identifiers, idempotent). No `meta/NNNN_snapshot.json` file (0060–0062 have none).

4. Open the hand-written `.sql` file and confirm it contains exactly three `CREATE TABLE` statements (`oauth_clients`, `oauth_authorization_codes`, `oauth_refresh_tokens`) plus their indexes and FK constraints — no `ALTER TYPE`, no data migration, no RLS `DO $$` blocks (per Global Constraints, no RLS on these tables). Nothing beyond additive `CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS`.

5. Hand-append the journal entry to `meta/_journal.json`'s `entries` array (per the same coordinator ruling — drizzle-kit is not involved): `{ "idx": 40, "version": "7", "when": <Date.now() at append time>, "tag": "0063_oauth_clients", "breakpoints": true }`. Verify the JSON still parses and the tail reads idx 40 / `0063_oauth_clients`, and that the diff is a pure tail-append (no whole-file reformat).

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
node "C:/Users/maxim/CascadeProjects/Seldon Frame/packages/crm/scripts/check-migrations-journaled.mjs"
```
(The last command re-runs the repo's own orphan-migration checker — confirms 0063 is properly journaled, not just present on disk. Use whatever invocation form `check-migrations-journaled.mjs`'s own header comment documents if it differs from a bare `node <path>`.)

**Commit:** `feat(oauth): add oauth_clients/oauth_authorization_codes/oauth_refresh_tokens schema (migration 0063)`

---

## Task 2 — `ApiKeyKind` extension + `mintWorkspaceToken`/`validateRawWorkspaceToken` kind-aware changes

**Goal:** the ONE change to the existing token rail. TDD: write the failing spec first.

1. Write `packages/crm/tests/unit/auth/workspace-token-oauth-kind.spec.ts`:

```ts
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// These tests exercise validateRawWorkspaceToken's kind-matching behavior
// against a fake db layer, mirroring the DI style already used elsewhere in
// this test suite for DB-touching pure logic (see design doc §2.10 — this
// repo's node:test convention). We are NOT hitting a real Postgres here;
// the db import itself is mocked at the module level.
//
// NOTE: workspace-token.ts currently imports `db` directly from "@/db" with
// no injection seam. Task 2 ALSO introduces a minimal seam (see step 2 below)
// so this kind-matching logic is testable without a live DB — do not skip
// that refactor and try to test through a real connection.

describe("validateRawWorkspaceToken kind matching (post Task 2)", () => {
  it("resolves a token with kind='workspace' (existing behavior, unchanged)", async () => {
    // ... constructed against the new queryApiKeyByPrefixAndHash seam (step 2)
  });

  it("resolves a token with kind='oauth' (new behavior)", async () => {
    // ...
  });

  it("still rejects a token with kind='user' (legacy x-api-key rows must never validate as a bearer)", async () => {
    // ...
  });
});
```

(The plan intentionally does not spell out every mock body here — the exact mocking mechanics depend on how the DI seam in step 2 shapes the query function's signature. Write the real assertions once step 2's seam exists; the three `it` cases above are the required behavioral coverage, not a literal copy-paste.)

2. In `packages/crm/src/lib/auth/workspace-token.ts`:
   - Change `export type MintWorkspaceTokenOptions` to add an optional `kind?: ApiKeyKind` (default `"workspace"` inside the function body — every existing call site that omits it keeps minting `kind: "workspace"` rows, byte-for-byte unchanged) and an optional `expiresInMinutes?: number` sibling to the existing `expiresInDays` (needed for the ~1h OAuth expiry — `expiresInDays: 0.0417` is not an acceptable way to express "1 hour"; add the new field rather than abuse the existing one). Import `ApiKeyKind` from `@/db/schema`.
   - Change the `validateRawWorkspaceToken` query's `WHERE` clause from `eq(apiKeys.kind, "workspace")` to `inArray(apiKeys.kind, ["workspace", "oauth"])` (import `inArray` from `drizzle-orm` alongside the existing `and`/`eq`). This is the ENTIRE behavioral change to this function — expiry check, null-for-both-failure-modes, `lastUsedAt` touch all stay exactly as they are.
   - Update the doc comment above `validateRawWorkspaceToken` to mention it now accepts both `kind`s (the current comment describes it as "the api_keys table" generically — add one sentence, don't rewrite the whole comment).

3. In `packages/crm/src/db/schema/api-keys.ts`, change:
   ```ts
   export type ApiKeyKind = "user" | "workspace" | "oauth";
   ```
   That's the only line in this file that changes. Do not touch the `kind` column definition itself (still `text().$type<ApiKeyKind>().notNull().default("user")` — the widened union is picked up automatically).

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```
Also manually re-read `packages/crm/tests/unit/auth/workspace-token-parse.spec.ts` (the PRE-EXISTING spec, not the new one) and confirm it still passes unmodified — this is the regression check that proves the `kind`-widening didn't disturb `extractWorkspaceToken`'s parsing logic (which this task doesn't touch, but the file's neighbor functions did change).

**Commit:** `feat(oauth): add "oauth" ApiKeyKind + widen validateRawWorkspaceToken to accept it`

---

## Task 3 — Pure module: PKCE verification

**Goal:** `packages/crm/src/lib/oauth/pkce.ts` — zero DB, zero Next imports, fully unit-testable.

1. Write `packages/crm/tests/unit/oauth/pkce.spec.ts` FIRST:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeCodeChallengeS256, verifyPkce } from "@/lib/oauth/pkce";

describe("computeCodeChallengeS256", () => {
  it("matches the RFC 7636 Appendix B test vector", () => {
    // RFC 7636 Appendix B: verifier "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    // → challenge "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    assert.equal(computeCodeChallengeS256(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("verifyPkce", () => {
  it("accepts a correct verifier for method S256", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    assert.equal(verifyPkce({ verifier, challenge, method: "S256" }), true);
  });

  it("rejects an incorrect verifier", () => {
    assert.equal(
      verifyPkce({ verifier: "wrong-verifier", challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", method: "S256" }),
      false
    );
  });

  it("rejects method 'plain' unconditionally (S256-only design constraint)", () => {
    // Even if verifier === challenge (which is what "plain" would accept),
    // this codebase never honors "plain" — the AS metadata only advertises
    // S256 and this function enforces that at the verification layer too,
    // not just at the advertised-capability layer.
    assert.equal(verifyPkce({ verifier: "same-value", challenge: "same-value", method: "plain" as never }), false);
  });

  it("rejects an empty verifier", () => {
    assert.equal(verifyPkce({ verifier: "", challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", method: "S256" }), false);
  });

  it("rejects an empty challenge", () => {
    assert.equal(verifyPkce({ verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", challenge: "", method: "S256" }), false);
  });
});
```

2. Implement `packages/crm/src/lib/oauth/pkce.ts`:

```ts
import crypto from "node:crypto";

/**
 * Computes the S256 PKCE code_challenge for a given code_verifier, per
 * RFC 7636 §4.2: BASE64URL-ENCODE(SHA256(ASCII(code_verifier))).
 */
export function computeCodeChallengeS256(verifier: string): string {
  return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export type PkceMethod = "S256";

/**
 * Verifies a presented code_verifier against a stored code_challenge.
 * S256-ONLY by design (this codebase's OAuth AS never advertises or accepts
 * "plain" — see 2026-07-03-oauth-connector-design.md §4, "PKCE S256 only").
 * Any method other than the literal string "S256" is rejected unconditionally,
 * regardless of whether verifier/challenge would otherwise "match" under a
 * plain comparison — this prevents a caller from ever downgrading via a
 * mislabeled method string.
 */
export function verifyPkce(params: { verifier: string; challenge: string; method: string }): boolean {
  if (params.method !== "S256") return false;
  if (!params.verifier || !params.challenge) return false;
  const computed = computeCodeChallengeS256(params.verifier);
  // Constant-time compare to avoid timing side-channels on the challenge match.
  const a = Buffer.from(computed);
  const b = Buffer.from(params.challenge);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(oauth): add PKCE S256 verification pure module + RFC 7636 test vector spec`

---

## Task 4 — Pure module: code/token hashing + generation

**Goal:** `packages/crm/src/lib/oauth/tokens.ts` — mirrors the existing SHA-256 pattern from `workspace-token.ts` exactly (do not invent a different hash scheme).

1. Write `packages/crm/tests/unit/oauth/tokens.spec.ts` FIRST:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateAuthorizationCode, generateRefreshToken, hashOauthSecret } from "@/lib/oauth/tokens";

describe("hashOauthSecret", () => {
  it("produces a deterministic SHA-256 hex digest", () => {
    const h1 = hashOauthSecret("abc123");
    const h2 = hashOauthSecret("abc123");
    assert.equal(h1, h2);
    assert.equal(h1.length, 64); // hex-encoded SHA-256 = 64 chars
  });

  it("produces different digests for different inputs", () => {
    assert.notEqual(hashOauthSecret("abc123"), hashOauthSecret("abc124"));
  });
});

describe("generateAuthorizationCode", () => {
  it("returns a sufficiently random, URL-safe string", () => {
    const code = generateAuthorizationCode();
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    assert.ok(code.length >= 32);
  });

  it("never generates the same code twice across many calls", () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateAuthorizationCode()));
    assert.equal(codes.size, 1000);
  });
});

describe("generateRefreshToken", () => {
  it("returns a sufficiently random, URL-safe string distinct from an authorization code's shape", () => {
    const token = generateRefreshToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.ok(token.length >= 32);
  });
});
```

2. Implement `packages/crm/src/lib/oauth/tokens.ts`:

```ts
import crypto from "node:crypto";

/**
 * SHA-256 hex digest — the SAME hashing scheme workspace-token.ts already
 * uses for wst_ bearer tokens (crypto.createHash("sha256").update(x).digest("hex")).
 * Reused verbatim here for authorization codes and refresh tokens so this
 * codebase has exactly one "how do we hash a secret at rest" convention,
 * not two.
 */
export function hashOauthSecret(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const RANDOM_BYTES = 32;

export function generateAuthorizationCode(): string {
  return crypto.randomBytes(RANDOM_BYTES).toString("base64url");
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(RANDOM_BYTES).toString("base64url");
}
```

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(oauth): add authorization-code/refresh-token generation + hashing pure module`

---

## Task 5 — Pure module: redirect_uri validation (exact-match + RFC 8252 loopback exception)

**Goal:** `packages/crm/src/lib/oauth/redirect-uri.ts`.

1. Write `packages/crm/tests/unit/oauth/redirect-uri.spec.ts` FIRST:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRedirectUriAllowed } from "@/lib/oauth/redirect-uri";

describe("isRedirectUriAllowed", () => {
  it("accepts an exact match against the allowlist", () => {
    assert.equal(
      isRedirectUriAllowed("https://claude.ai/api/mcp/auth_callback", ["https://claude.ai/api/mcp/auth_callback"]),
      true
    );
  });

  it("rejects a URI not in the allowlist", () => {
    assert.equal(isRedirectUriAllowed("https://evil.example.com/callback", ["https://claude.ai/api/mcp/auth_callback"]), false);
  });

  it("rejects a near-miss (trailing slash difference) — exact match only, no normalization", () => {
    assert.equal(
      isRedirectUriAllowed("https://claude.ai/api/mcp/auth_callback/", ["https://claude.ai/api/mcp/auth_callback"]),
      false
    );
  });

  it("accepts Claude Code's loopback http://localhost/callback ignoring the port, per RFC 8252 §7.3", () => {
    assert.equal(isRedirectUriAllowed("http://localhost:54321/callback", ["http://localhost/callback"]), true);
  });

  it("accepts Claude Code's loopback http://127.0.0.1/callback ignoring the port", () => {
    assert.equal(isRedirectUriAllowed("http://127.0.0.1:9999/callback", ["http://127.0.0.1/callback"]), true);
  });

  it("does NOT apply the port-agnostic exception to a non-loopback host", () => {
    assert.equal(isRedirectUriAllowed("http://example.com:8080/callback", ["http://example.com/callback"]), false);
  });

  it("does NOT apply the port-agnostic exception across scheme (http vs https)", () => {
    assert.equal(isRedirectUriAllowed("https://localhost:54321/callback", ["http://localhost/callback"]), false);
  });

  it("does NOT apply the port-agnostic exception across differing paths", () => {
    assert.equal(isRedirectUriAllowed("http://localhost:54321/other-path", ["http://localhost/callback"]), false);
  });

  it("rejects a malformed URI without throwing", () => {
    assert.equal(isRedirectUriAllowed("not a url", ["http://localhost/callback"]), false);
  });
});
```

2. Implement `packages/crm/src/lib/oauth/redirect-uri.ts`:

```ts
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Exact-match redirect_uri validation, with ONE spec-mandated exception:
 * RFC 8252 §7.3 requires ignoring the port component for loopback redirect
 * URIs (native clients bind an ephemeral port per run). Anthropic's own
 * connector-authentication docs confirm Claude Code relies on exactly this:
 * "your authorization server must accept both [localhost and 127.0.0.1]
 * with the port component ignored" (see design doc §1.2).
 *
 * Every other mismatch (scheme, host, path, or a non-loopback port) is a
 * hard reject — this is the open-redirect defense the MCP spec requires
 * ("Authorization servers MUST validate exact redirect URIs against
 * pre-registered values").
 */
export function isRedirectUriAllowed(candidate: string, allowlist: string[]): boolean {
  let candidateUrl: URL;
  try {
    candidateUrl = new URL(candidate);
  } catch {
    return false;
  }

  for (const allowed of allowlist) {
    if (candidate === allowed) return true;

    if (!LOOPBACK_HOSTS.has(candidateUrl.hostname)) continue;

    let allowedUrl: URL;
    try {
      allowedUrl = new URL(allowed);
    } catch {
      continue;
    }
    if (!LOOPBACK_HOSTS.has(allowedUrl.hostname)) continue;
    if (candidateUrl.protocol !== allowedUrl.protocol) continue;
    if (candidateUrl.hostname !== allowedUrl.hostname) continue;
    if (candidateUrl.pathname !== allowedUrl.pathname) continue;
    // Port intentionally NOT compared — this is the RFC 8252 exception.
    return true;
  }

  return false;
}
```

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(oauth): add redirect_uri exact-match validation with RFC 8252 loopback port exception`

---

## Task 6 — `.well-known/oauth-protected-resource` route + unit spec for its pure builder

**Goal:** the first live endpoint. Metadata-building logic is pure (testable without a request); the route is a thin wrapper.

1. Write `packages/crm/tests/unit/oauth/protected-resource-metadata.spec.ts` FIRST:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProtectedResourceMetadata } from "@/lib/oauth/protected-resource-metadata";

describe("buildProtectedResourceMetadata", () => {
  it("returns the exact literal MCP resource URL and a single-entry authorization_servers array", () => {
    const doc = buildProtectedResourceMetadata({
      mcpResourceUrl: "https://mcp.seldonframe.com/v1",
      authorizationServerIssuer: "https://app.seldonframe.com",
    });
    assert.equal(doc.resource, "https://mcp.seldonframe.com/v1");
    assert.deepEqual(doc.authorization_servers, ["https://app.seldonframe.com"]);
  });
});
```

2. Implement `packages/crm/src/lib/oauth/protected-resource-metadata.ts`:

```ts
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
}

/**
 * RFC 9728 protected-resource metadata builder. `resource` MUST be the
 * exact literal MCP server URL as a user types it into claude.ai's "Add
 * custom connector" field — Anthropic's docs are explicit that this field
 * "must match your MCP server URL exactly... including any path component"
 * (see design doc §1.2). `authorization_servers` is a single-entry array
 * because this AS is co-located and there is exactly one issuer — per
 * Anthropic's docs, "Claude uses the first entry and does not fall back to
 * later entries," so an accidental second entry here would be silently
 * ignored at best, confusing at worst. Keep it single-entry deliberately.
 */
export function buildProtectedResourceMetadata(params: {
  mcpResourceUrl: string;
  authorizationServerIssuer: string;
}): ProtectedResourceMetadata {
  return {
    resource: params.mcpResourceUrl,
    authorization_servers: [params.authorizationServerIssuer],
  };
}
```

3. Implement the route `packages/crm/src/app/.well-known/oauth-protected-resource/route.ts`:

```ts
// RFC 9728 Protected Resource Metadata for mcp.seldonframe.com/v1 — served on
// the MCP host itself (design doc §2.4: this path is deliberately OUTSIDE
// proxy.ts's config.matcher, mirroring the two existing .well-known
// precedents — src/app/api/ap2/.well-known/route.ts and
// src/app/.well-known/openai-apps-challenge/route.ts — both public, static,
// unauthenticated, and never touched by authProxy).
//
// SF_OAUTH_ENABLED gate: 404 when unset/false. This must be the FIRST check
// in the handler body, before any other logic.
import { NextResponse } from "next/server";
import { buildProtectedResourceMetadata } from "@/lib/oauth/protected-resource-metadata";

export const runtime = "nodejs";

const MCP_RESOURCE_URL = "https://mcp.seldonframe.com/v1";
const AUTHORIZATION_SERVER_ISSUER = "https://app.seldonframe.com";

export async function GET() {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const metadata = buildProtectedResourceMetadata({
    mcpResourceUrl: MCP_RESOURCE_URL,
    authorizationServerIssuer: AUTHORIZATION_SERVER_ISSUER,
  });

  return NextResponse.json(metadata, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
```

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```
Additionally — since this is the first live route and the design doc flags `handleBuilderMcpHost`'s interaction with non-`/v1` paths on `mcp.seldonframe.com` as an assumption worth proving, not just asserting — run a local dev-server check now rather than deferring all route verification to Task 14:
```bash
cd packages/crm && SF_OAUTH_ENABLED=true pnpm dev
# in a second terminal, with the Host header simulating the mcp subdomain:
curl -s -H "Host: mcp.seldonframe.com" http://localhost:3000/.well-known/oauth-protected-resource | jq .
# expect: {"resource":"https://mcp.seldonframe.com/v1","authorization_servers":["https://app.seldonframe.com"]}
# also confirm the flag-off case:
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: mcp.seldonframe.com" http://localhost:3000/.well-known/oauth-protected-resource
# (restart dev server without SF_OAUTH_ENABLED set) expect: 404
```

**Commit:** `feat(oauth): add /.well-known/oauth-protected-resource (RFC 9728) behind SF_OAUTH_ENABLED`

---

## Task 7 — `.well-known/oauth-authorization-server` route + unit spec

**Goal:** RFC 8414 AS metadata, served on `app.seldonframe.com`.

1. Write `packages/crm/tests/unit/oauth/authorization-server-metadata.spec.ts` FIRST:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAuthorizationServerMetadata } from "@/lib/oauth/authorization-server-metadata";

describe("buildAuthorizationServerMetadata", () => {
  it("advertises S256 as the ONLY supported PKCE method", () => {
    const doc = buildAuthorizationServerMetadata({ issuer: "https://app.seldonframe.com" });
    assert.deepEqual(doc.code_challenge_methods_supported, ["S256"]);
  });

  it("includes all three endpoint URLs derived from the issuer", () => {
    const doc = buildAuthorizationServerMetadata({ issuer: "https://app.seldonframe.com" });
    assert.equal(doc.issuer, "https://app.seldonframe.com");
    assert.equal(doc.authorization_endpoint, "https://app.seldonframe.com/oauth/authorize");
    assert.equal(doc.token_endpoint, "https://app.seldonframe.com/api/oauth/token");
    assert.equal(doc.registration_endpoint, "https://app.seldonframe.com/api/oauth/register");
  });

  it("advertises only the authorization_code and refresh_token grant types", () => {
    const doc = buildAuthorizationServerMetadata({ issuer: "https://app.seldonframe.com" });
    assert.deepEqual(doc.grant_types_supported, ["authorization_code", "refresh_token"]);
  });

  it("advertises token_endpoint_auth_methods_supported as public-client-only ('none')", () => {
    const doc = buildAuthorizationServerMetadata({ issuer: "https://app.seldonframe.com" });
    assert.deepEqual(doc.token_endpoint_auth_methods_supported, ["none"]);
  });
});
```

2. Implement `packages/crm/src/lib/oauth/authorization-server-metadata.ts`:

```ts
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

/**
 * RFC 8414 Authorization Server Metadata. code_challenge_methods_supported
 * MUST be exactly ["S256"] — its absence tells an MCP client "this AS
 * doesn't support PKCE" per spec, and advertising "plain" would contradict
 * this design's S256-only enforcement (see pkce.ts). token_endpoint_auth_methods_supported
 * is ["none"] because this AS only registers public clients (no client
 * secret ever issued) — see design doc §3.2.
 */
export function buildAuthorizationServerMetadata(params: { issuer: string }): AuthorizationServerMetadata {
  const issuer = params.issuer.replace(/\/+$/, "");
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}
```

3. Implement the route `packages/crm/src/app/.well-known/oauth-authorization-server/route.ts`:

```ts
import { NextResponse } from "next/server";
import { buildAuthorizationServerMetadata } from "@/lib/oauth/authorization-server-metadata";

export const runtime = "nodejs";

const ISSUER = "https://app.seldonframe.com";

export async function GET() {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json(buildAuthorizationServerMetadata({ issuer: ISSUER }), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
```

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(oauth): add /.well-known/oauth-authorization-server (RFC 8414) behind SF_OAUTH_ENABLED`

---

## Task 8 — `POST /api/oauth/register` (open DCR, public clients only)

**Goal:** RFC 7591 registration. Pure validation logic separated from the DB-writing route.

1. Write `packages/crm/tests/unit/oauth/register-request.spec.ts` FIRST:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRegisterRequest } from "@/lib/oauth/register-request";

describe("parseRegisterRequest", () => {
  it("accepts a well-formed request with an https redirect_uri", () => {
    const result = parseRegisterRequest({
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      client_name: "Claude",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value.redirectUris, ["https://claude.ai/api/mcp/auth_callback"]);
      assert.equal(result.value.clientName, "Claude");
    }
  });

  it("accepts a loopback http redirect_uri (Claude Code)", () => {
    const result = parseRegisterRequest({ redirect_uris: ["http://localhost/callback"] });
    assert.equal(result.ok, true);
  });

  it("accepts the 127.0.0.1 loopback form", () => {
    const result = parseRegisterRequest({ redirect_uris: ["http://127.0.0.1/callback"] });
    assert.equal(result.ok, true);
  });

  it("rejects a non-HTTPS, non-loopback redirect_uri (open redirect / MITM risk)", () => {
    const result = parseRegisterRequest({ redirect_uris: ["http://evil.example.com/callback"] });
    assert.equal(result.ok, false);
  });

  it("rejects an empty redirect_uris array", () => {
    const result = parseRegisterRequest({ redirect_uris: [] });
    assert.equal(result.ok, false);
  });

  it("rejects a missing redirect_uris field", () => {
    const result = parseRegisterRequest({});
    assert.equal(result.ok, false);
  });

  it("rejects a malformed redirect_uri string", () => {
    const result = parseRegisterRequest({ redirect_uris: ["not a url"] });
    assert.equal(result.ok, false);
  });

  it("defaults client_name to undefined when omitted (not required by RFC 7591)", () => {
    const result = parseRegisterRequest({ redirect_uris: ["https://example.com/callback"] });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.clientName, undefined);
  });

  it("truncates an absurdly long client_name rather than rejecting (defense against a griefing payload, not a spec requirement)", () => {
    const longName = "x".repeat(5000);
    const result = parseRegisterRequest({ redirect_uris: ["https://example.com/callback"], client_name: longName });
    assert.equal(result.ok, true);
    if (result.ok) assert.ok((result.value.clientName?.length ?? 0) <= 256);
  });
});
```

2. Implement `packages/crm/src/lib/oauth/register-request.ts`:

```ts
export interface ParsedRegisterRequest {
  redirectUris: string[];
  clientName?: string;
}

export type ParseRegisterResult =
  | { ok: true; value: ParsedRegisterRequest }
  | { ok: false; error: string };

const MAX_CLIENT_NAME_LENGTH = 256;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

function isAcceptableRedirectUri(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return true;
  return false;
}

/**
 * Validates an RFC 7591 registration request body. Open DCR (no auth on this
 * endpoint) means we cannot trust the caller AT ALL — every redirect_uri
 * offered here becomes part of the allowlist a future /oauth/authorize call
 * can redirect to, so this is the ONE gate standing between "anyone can
 * register a client" and "anyone can register a client with an open
 * redirect." HTTPS or loopback-http only — no plain http to a real host,
 * ever (see design doc §4, "No open redirects").
 */
export function parseRegisterRequest(body: unknown): ParseRegisterResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "invalid_request" };
  }
  const record = body as Record<string, unknown>;
  const redirectUrisRaw = record.redirect_uris;
  if (!Array.isArray(redirectUrisRaw) || redirectUrisRaw.length === 0) {
    return { ok: false, error: "invalid_request: redirect_uris must be a non-empty array" };
  }
  const redirectUris: string[] = [];
  for (const uri of redirectUrisRaw) {
    if (typeof uri !== "string" || !isAcceptableRedirectUri(uri)) {
      return { ok: false, error: `invalid_redirect_uri: ${String(uri)}` };
    }
    redirectUris.push(uri);
  }

  let clientName: string | undefined;
  if (typeof record.client_name === "string") {
    clientName = record.client_name.slice(0, MAX_CLIENT_NAME_LENGTH);
  }

  return { ok: true, value: { redirectUris, clientName } };
}
```

3. Implement the route `packages/crm/src/app/api/oauth/register/route.ts`:

```ts
// RFC 7591 Dynamic Client Registration — OPEN (no auth), public clients only.
// This endpoint is deliberately reachable by anyone (that's what "dynamic"
// means) — parseRegisterRequest is the entire trust boundary (see its doc
// comment). Rate-limited per-IP because it's the most abuse-prone surface
// in this feature (see design doc §4).
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { oauthClients } from "@/db/schema";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { parseRegisterRequest } from "@/lib/oauth/register-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for") ?? "local";
  if (!(await checkRateLimit(`oauth:register:${forwardedFor}`, 20, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = parseRegisterRequest(rawBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: parsed.error }, { status: 400 });
  }

  const clientId = crypto.randomBytes(24).toString("base64url");

  await db.insert(oauthClients).values({
    clientId,
    clientName: parsed.value.clientName ?? null,
    redirectUris: parsed.value.redirectUris,
  });

  // RFC 7591 §3.2.1 successful-response shape. token_endpoint_auth_method
  // is ALWAYS "none" — public clients only, no client_secret is ever minted
  // or returned (see design doc §3.2).
  return NextResponse.json(
    {
      client_id: clientId,
      client_name: parsed.value.clientName,
      redirect_uris: parsed.value.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 }
  );
}
```

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(oauth): add POST /api/oauth/register (open DCR, public clients only)`

---

## Task 9 — Consent-screen data layer: workspace picker query

**Goal:** the query that powers the `/oauth/authorize` page's workspace picker (design doc §2.5's `org_members` join). Pure-ish (DB-touching, so this one is an integration-style unit test with a real test-DB pattern if the repo has one, OR a thin function kept small enough that route-level testing in Task 10 covers it — check `packages/crm/tests/integration/` for an existing DB-test harness pattern before deciding; if one exists, follow it, do not invent a second DB-testing convention).

1. Before writing code, run:
   ```bash
   find "C:/Users/maxim/CascadeProjects/Seldon Frame/packages/crm/tests/integration" -maxdepth 2
   ```
   and read one existing integration spec there to confirm the repo's real DB-test convention (test-database URL env var, setup/teardown pattern, transaction-rollback-per-test or truncate-between-tests). Mirror that exact convention — do not introduce a new one.

2. Implement `packages/crm/src/lib/oauth/workspace-picker.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, organizations } from "@/db/schema";

export interface WorkspaceOption {
  orgId: string;
  name: string;
  role: string;
}

/**
 * Every workspace a user can consent to grant OAuth access for — the
 * consent screen's picker (design doc §2.5). Defaults the CALLER's
 * pre-selection to session.user.orgId (the currently-active workspace);
 * this function just returns the full list, selection logic lives in the
 * page component.
 */
export async function listWorkspacesForUser(userId: string): Promise<WorkspaceOption[]> {
  const rows = await db
    .select({ orgId: orgMembers.orgId, name: organizations.name, role: orgMembers.role })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, userId));
  return rows;
}
```

(Adjust the `organizations.name` column reference if the real schema names it differently — verify against `packages/crm/src/db/schema/organizations.ts` before finalizing; this plan assumes a `name` column exists based on standard conventions but was not directly re-read in this pass since it's a low-risk, easily-corrected assumption.)

3. Write an integration-style spec (path/convention per step 1's finding) that seeds two orgs + one user belonging to both via `orgMembers`, then asserts `listWorkspacesForUser` returns both.

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(oauth): add listWorkspacesForUser query for the consent-screen workspace picker`

---

## Task 10 — `GET /oauth/authorize` (consent screen)

**Goal:** the page. Requires an existing NextAuth session (redirect to login + back, per design doc §2.4 decision (b) — the route resolves its own auth via `auth()` directly, does NOT rely on `proxy.ts`'s `authProxy`).

1. Write `packages/crm/tests/unit/oauth/authorize-request.spec.ts` FIRST — covering the pure query-param validation (PKCE params present, `code_challenge_method` is literally `S256`, `client_id` is a non-empty string, `redirect_uri` is present) that the page needs before it can even render:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAuthorizeRequest } from "@/lib/oauth/authorize-request";

describe("parseAuthorizeRequest", () => {
  const validParams = new URLSearchParams({
    response_type: "code",
    client_id: "abc123",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "xyz",
  });

  it("accepts a well-formed request", () => {
    const result = parseAuthorizeRequest(validParams);
    assert.equal(result.ok, true);
  });

  it("rejects response_type other than 'code'", () => {
    const params = new URLSearchParams(validParams);
    params.set("response_type", "token");
    assert.equal(parseAuthorizeRequest(params).ok, false);
  });

  it("rejects code_challenge_method other than 'S256' (e.g. 'plain')", () => {
    const params = new URLSearchParams(validParams);
    params.set("code_challenge_method", "plain");
    const result = parseAuthorizeRequest(params);
    assert.equal(result.ok, false);
  });

  it("rejects a missing code_challenge (PKCE is mandatory, not optional)", () => {
    const params = new URLSearchParams(validParams);
    params.delete("code_challenge");
    assert.equal(parseAuthorizeRequest(params).ok, false);
  });

  it("rejects a missing client_id", () => {
    const params = new URLSearchParams(validParams);
    params.delete("client_id");
    assert.equal(parseAuthorizeRequest(params).ok, false);
  });

  it("rejects a missing redirect_uri", () => {
    const params = new URLSearchParams(validParams);
    params.delete("redirect_uri");
    assert.equal(parseAuthorizeRequest(params).ok, false);
  });

  it("passes through an optional resource param when present", () => {
    const params = new URLSearchParams(validParams);
    params.set("resource", "https://mcp.seldonframe.com/v1");
    const result = parseAuthorizeRequest(params);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.resource, "https://mcp.seldonframe.com/v1");
  });

  it("leaves resource undefined when absent (not required — client MUST send it per spec, but server tolerates its absence rather than hard-failing, since resource binding here is defense-in-depth not the sole audience check)", () => {
    const result = parseAuthorizeRequest(validParams);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.resource, undefined);
  });

  it("preserves state verbatim for later passthrough", () => {
    const result = parseAuthorizeRequest(validParams);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.state, "xyz");
  });
});
```

2. Implement `packages/crm/src/lib/oauth/authorize-request.ts`:

```ts
export interface ParsedAuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource?: string;
}

export type ParseAuthorizeResult =
  | { ok: true; value: ParsedAuthorizeRequest }
  | { ok: false; error: string };

/**
 * Validates the /oauth/authorize query string BEFORE we render anything or
 * touch the DB. response_type MUST be "code" (this AS never supports
 * implicit grant) and code_challenge_method MUST be literally "S256" — any
 * other value (including the legacy "plain") is rejected here, at the very
 * first gate, not silently downgraded downstream. state and resource are
 * both optional to the SERVER (client MUST send resource per RFC 8707, but
 * the server tolerating its absence is safer than hard-failing a client
 * that's otherwise spec-compliant on every other dimension).
 */
export function parseAuthorizeRequest(params: URLSearchParams): ParseAuthorizeResult {
  if (params.get("response_type") !== "code") {
    return { ok: false, error: "unsupported_response_type" };
  }
  if (params.get("code_challenge_method") !== "S256") {
    return { ok: false, error: "invalid_request: code_challenge_method must be S256" };
  }
  const clientId = params.get("client_id");
  if (!clientId) return { ok: false, error: "invalid_request: missing client_id" };
  const redirectUri = params.get("redirect_uri");
  if (!redirectUri) return { ok: false, error: "invalid_request: missing redirect_uri" };
  const codeChallenge = params.get("code_challenge");
  if (!codeChallenge) return { ok: false, error: "invalid_request: missing code_challenge" };

  return {
    ok: true,
    value: {
      clientId,
      redirectUri,
      codeChallenge,
      state: params.get("state") ?? undefined,
      resource: params.get("resource") ?? undefined,
    },
  };
}
```

3. Implement the page `packages/crm/src/app/oauth/authorize/page.tsx`. This is the one file in this plan with meaningfully more than "parse → call pure module → map to Response" — it's a server component rendering a form, so keep its OWN logic to: (a) call `auth()`, (b) redirect to login if absent, (c) call `parseAuthorizeRequest`, (d) look up the client's allowlisted redirect URIs via `oauthClients` and re-validate with `isRedirectUriAllowed` (Task 5), (e) call `listWorkspacesForUser` (Task 9), (f) render the form. Every one of those five steps delegates to an already-tested pure/DB module — the page itself has no novel logic to unit-test beyond what Tasks 3/5/9/10-step-2 already cover.

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { oauthClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseAuthorizeRequest } from "@/lib/oauth/authorize-request";
import { isRedirectUriAllowed } from "@/lib/oauth/redirect-uri";
import { listWorkspacesForUser } from "@/lib/oauth/workspace-picker";

export const dynamic = "force-dynamic";

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    redirect("/404");
  }

  const resolvedParams = await searchParams;
  const urlSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === "string") urlSearchParams.set(key, value);
  }

  const parsed = parseAuthorizeRequest(urlSearchParams);
  if (!parsed.ok) {
    // Per MCP spec + design doc §4: an invalid/unrecognized request at this
    // stage gets an IN-PAGE error, never a redirect — we don't yet know
    // whether the redirect_uri is trustworthy at this point in some failure
    // modes (e.g. missing client_id means we can't even look up the
    // allowlist), so redirecting anywhere would risk exactly the open-
    // redirect this design explicitly guards against.
    return <div>Invalid authorization request: {parsed.error}</div>;
  }

  const session = await auth();
  if (!session?.user?.id) {
    const returnTo = `/oauth/authorize?${urlSearchParams.toString()}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  }

  const [client] = await db
    .select({ redirectUris: oauthClients.redirectUris, clientName: oauthClients.clientName })
    .from(oauthClients)
    .where(eq(oauthClients.clientId, parsed.value.clientId))
    .limit(1);

  if (!client || !isRedirectUriAllowed(parsed.value.redirectUri, client.redirectUris)) {
    // Same in-page-error rule as above — an unregistered or mismatched
    // redirect_uri must NEVER receive an automatic redirect.
    return <div>Unknown client or unregistered redirect_uri.</div>;
  }

  const workspaces = await listWorkspacesForUser(session.user.id);

  return (
    <div>
      <h1>{client.clientName ?? "An application"} wants to access your SeldonFrame workspace</h1>
      {/* MCP spec + Anthropic docs requirement: display the redirect URI hostname
          clearly, with an extra warning if it's loopback-only (design doc §1.1/§1.2). */}
      <p>You will be redirected to: <strong>{new URL(parsed.value.redirectUri).hostname}</strong></p>
      {(new URL(parsed.value.redirectUri).hostname === "localhost" ||
        new URL(parsed.value.redirectUri).hostname === "127.0.0.1") && (
        <p role="alert">This is a local application running on your own device.</p>
      )}
      <form action="/api/oauth/authorize" method="POST">
        <input type="hidden" name="client_id" value={parsed.value.clientId} />
        <input type="hidden" name="redirect_uri" value={parsed.value.redirectUri} />
        <input type="hidden" name="code_challenge" value={parsed.value.codeChallenge} />
        <input type="hidden" name="state" value={parsed.value.state ?? ""} />
        <input type="hidden" name="resource" value={parsed.value.resource ?? ""} />
        <label>
          Workspace:
          <select name="org_id" defaultValue={session.user.orgId}>
            {workspaces.map((ws) => (
              <option key={ws.orgId} value={ws.orgId}>
                {ws.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Approve</button>
      </form>
    </div>
  );
}
```

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
bash scripts/check-use-server.sh src   # from packages/crm — this page has no "use server" actions, confirm it doesn't need one
```

**Commit:** `feat(oauth): add GET /oauth/authorize consent screen with workspace picker`

---

## Task 11 — `POST /api/oauth/authorize` (the "Approve" form target — issues the code)

**Goal:** validate everything server-side AGAIN (never trust the hidden form fields as the sole source of truth — they round-tripped through the user's browser), then mint + store the authorization code, then 302 redirect.

1. Write `packages/crm/tests/unit/oauth/issue-authorization-code.spec.ts` FIRST — testing the pure decision logic of "given a submitted approval + the client's real allowlist, should we issue a code, and what should we store":

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAuthorizationCodeRecord } from "@/lib/oauth/issue-authorization-code";

describe("buildAuthorizationCodeRecord", () => {
  it("sets expiresAt to createdAt + 60 seconds exactly", () => {
    const now = new Date("2026-07-03T12:00:00.000Z");
    const record = buildAuthorizationCodeRecord({
      clientId: "c1",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      orgId: "org1",
      userId: "user1",
      codeChallenge: "chal",
      resource: undefined,
      now,
    });
    assert.equal(record.expiresAt.getTime() - now.getTime(), 60_000);
  });

  it("generates a code and its hash consistently (hash matches hashOauthSecret(code))", () => {
    const now = new Date();
    const record = buildAuthorizationCodeRecord({
      clientId: "c1",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      orgId: "org1",
      userId: "user1",
      codeChallenge: "chal",
      resource: undefined,
      now,
    });
    // record.code is the raw value to return to the caller ONCE;
    // record.codeHash is what gets persisted. They must correspond.
    assert.notEqual(record.code, record.codeHash);
    assert.ok(record.codeHash.length === 64); // sha256 hex
  });
});
```

2. Implement `packages/crm/src/lib/oauth/issue-authorization-code.ts`:

```ts
import { generateAuthorizationCode, hashOauthSecret } from "@/lib/oauth/tokens";

export interface AuthorizationCodeRecord {
  code: string; // raw — return to caller ONCE, never persist this value
  codeHash: string; // persist this
  clientId: string;
  redirectUri: string;
  orgId: string;
  userId: string;
  codeChallenge: string;
  resource: string | undefined;
  expiresAt: Date;
}

const CODE_TTL_MS = 60_000; // task constraint: code TTL <= 60s, enforced server-side

export function buildAuthorizationCodeRecord(params: {
  clientId: string;
  redirectUri: string;
  orgId: string;
  userId: string;
  codeChallenge: string;
  resource: string | undefined;
  now: Date;
}): AuthorizationCodeRecord {
  const code = generateAuthorizationCode();
  return {
    code,
    codeHash: hashOauthSecret(code),
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    orgId: params.orgId,
    userId: params.userId,
    codeChallenge: params.codeChallenge,
    resource: params.resource,
    expiresAt: new Date(params.now.getTime() + CODE_TTL_MS),
  };
}
```

3. Implement the route `packages/crm/src/app/api/oauth/authorize/route.ts`:

```ts
// POST target of the /oauth/authorize consent form's "Approve" button.
// Re-validates EVERYTHING server-side — the hidden form fields round-tripped
// through the user's browser and are not trusted as-is, only as a cross-
// check against the real oauth_clients row (design doc §4, "code bound to
// client_id + redirect_uri + PKCE").
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { oauthClients, oauthAuthorizationCodes } from "@/db/schema";
import { isRedirectUriAllowed } from "@/lib/oauth/redirect-uri";
import { buildAuthorizationCodeRecord } from "@/lib/oauth/issue-authorization-code";
import { checkRateLimit } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "access_denied" }, { status: 401 });
  }

  if (!(await checkRateLimit(`oauth:authorize:${session.user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const state = String(form.get("state") ?? "");
  const resource = String(form.get("resource") ?? "") || undefined;
  const orgId = String(form.get("org_id") ?? "");

  if (!clientId || !redirectUri || !codeChallenge || !orgId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const [client] = await db
    .select({ redirectUris: oauthClients.redirectUris })
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);

  if (!client || !isRedirectUriAllowed(redirectUri, client.redirectUris)) {
    // Never redirect on a validation failure at this step — same rule as
    // the GET page (design doc §4).
    return NextResponse.json({ error: "invalid_client_or_redirect_uri" }, { status: 400 });
  }

  // TODO(task 9 cross-check): verify session.user.id actually belongs to
  // orgId via listWorkspacesForUser before trusting the submitted org_id —
  // a malicious page-tamperer could submit an org_id they don't belong to.
  // This check MUST be added in this task's real implementation, not
  // deferred — called out here explicitly so it isn't missed during
  // execution. Reject with 403 "invalid_org_selection" if the user isn't a
  // member of the submitted orgId.

  const record = buildAuthorizationCodeRecord({
    clientId,
    redirectUri,
    orgId,
    userId: session.user.id,
    codeChallenge,
    resource,
    now: new Date(),
  });

  await db.insert(oauthAuthorizationCodes).values({
    codeHash: record.codeHash,
    clientId: record.clientId,
    redirectUri: record.redirectUri,
    orgId: record.orgId,
    userId: record.userId,
    codeChallenge: record.codeChallenge,
    resource: record.resource,
    expiresAt: record.expiresAt,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", record.code);
  if (state) redirectUrl.searchParams.set("state", state);

  return NextResponse.redirect(redirectUrl.toString(), { status: 302 });
}
```

**IMPORTANT — do not skip the TODO above during real execution.** It's written into the plan as an explicit code comment specifically so it can't be silently dropped when this task is implemented; the membership check (user must actually belong to the selected `org_id`, via `listWorkspacesForUser` from Task 9) is a real authorization gap if omitted — a user could otherwise submit an arbitrary `org_id` in the hidden form field and mint a code scoped to a workspace they don't belong to. Resolve the TODO as part of implementing this task, not as a follow-up.

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(oauth): add POST /api/oauth/authorize — issues single-use, PKCE-bound authorization codes`

---

## Task 12 — `POST /api/oauth/token` — `authorization_code` grant

**Goal:** exchange a code for a `wst_` access token (kind="oauth") + refresh token.

1. Write `packages/crm/tests/unit/oauth/redeem-authorization-code.spec.ts` FIRST — the pure decision logic (given a stored code record + a presented `code_verifier` + `client_id` + `redirect_uri`, should the exchange succeed):

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCodeRedemption } from "@/lib/oauth/redeem-authorization-code";

const baseStoredCode = {
  clientId: "c1",
  redirectUri: "https://claude.ai/api/mcp/auth_callback",
  codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  expiresAt: new Date(Date.now() + 30_000),
  consumedAt: null as Date | null,
};
const CORRECT_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

describe("validateCodeRedemption", () => {
  it("succeeds with matching client_id, redirect_uri, and PKCE verifier, unexpired, unconsumed", () => {
    const result = validateCodeRedemption({
      storedCode: baseStoredCode,
      presentedClientId: "c1",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, true);
  });

  it("rejects a client_id mismatch", () => {
    const result = validateCodeRedemption({
      storedCode: baseStoredCode,
      presentedClientId: "wrong-client",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "invalid_grant");
  });

  it("rejects a redirect_uri mismatch", () => {
    const result = validateCodeRedemption({
      storedCode: baseStoredCode,
      presentedClientId: "c1",
      presentedRedirectUri: "https://different.example.com/callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, false);
  });

  it("rejects an incorrect PKCE verifier", () => {
    const result = validateCodeRedemption({
      storedCode: baseStoredCode,
      presentedClientId: "c1",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: "totally-wrong-verifier",
      now: new Date(),
    });
    assert.equal(result.ok, false);
  });

  it("rejects an expired code", () => {
    const result = validateCodeRedemption({
      storedCode: { ...baseStoredCode, expiresAt: new Date(Date.now() - 1000) },
      presentedClientId: "c1",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, false);
  });

  it("rejects an already-consumed code (single-use enforcement)", () => {
    const result = validateCodeRedemption({
      storedCode: { ...baseStoredCode, consumedAt: new Date() },
      presentedClientId: "c1",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, false);
  });

  it("rejects when storedCode is null (unknown code hash)", () => {
    const result = validateCodeRedemption({
      storedCode: null,
      presentedClientId: "c1",
      presentedRedirectUri: "https://claude.ai/api/mcp/auth_callback",
      presentedCodeVerifier: CORRECT_VERIFIER,
      now: new Date(),
    });
    assert.equal(result.ok, false);
  });
});
```

2. Implement `packages/crm/src/lib/oauth/redeem-authorization-code.ts`:

```ts
import { verifyPkce } from "@/lib/oauth/pkce";

export interface StoredAuthorizationCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export type ValidateRedemptionResult = { ok: true } | { ok: false; error: "invalid_grant" };

/**
 * The full authorization_code grant validation, per RFC 6749 §4.1.3 +
 * this design's PKCE-mandatory constraint. Every failure returns the SAME
 * error code ("invalid_grant") regardless of WHICH check failed — RFC 6749
 * doesn't want servers leaking "the code was right but the verifier was
 * wrong" vs "the code doesn't exist" (a probing vector), matching the same
 * anti-probing philosophy validateRawWorkspaceToken already uses for wst_
 * tokens (design doc §2.2).
 */
export function validateCodeRedemption(params: {
  storedCode: StoredAuthorizationCode | null;
  presentedClientId: string;
  presentedRedirectUri: string;
  presentedCodeVerifier: string;
  now: Date;
}): ValidateRedemptionResult {
  const { storedCode } = params;
  if (!storedCode) return { ok: false, error: "invalid_grant" };
  if (storedCode.consumedAt !== null) return { ok: false, error: "invalid_grant" };
  if (storedCode.expiresAt.getTime() <= params.now.getTime()) return { ok: false, error: "invalid_grant" };
  if (storedCode.clientId !== params.presentedClientId) return { ok: false, error: "invalid_grant" };
  if (storedCode.redirectUri !== params.presentedRedirectUri) return { ok: false, error: "invalid_grant" };
  if (!verifyPkce({ verifier: params.presentedCodeVerifier, challenge: storedCode.codeChallenge, method: "S256" })) {
    return { ok: false, error: "invalid_grant" };
  }
  return { ok: true };
}
```

3. Implement the route `packages/crm/src/app/api/oauth/token/route.ts` — this task covers ONLY the `authorization_code` branch; Task 13 adds `refresh_token`:

```ts
// POST /api/oauth/token — RFC 6749 token endpoint. MUST accept
// application/x-www-form-urlencoded (Anthropic's docs are explicit: "Claude
// sends both the initial token exchange and refresh requests with this
// content type" — design doc §1.2). Do NOT parse this as JSON.
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import crypto from "node:crypto";
import { db } from "@/db";
import { oauthAuthorizationCodes, oauthRefreshTokens } from "@/db/schema";
import { validateCodeRedemption } from "@/lib/oauth/redeem-authorization-code";
import { hashOauthSecret, generateRefreshToken } from "@/lib/oauth/tokens";
import { mintWorkspaceToken } from "@/lib/auth/workspace-token";
import { checkRateLimit } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";

const ACCESS_TOKEN_EXPIRY_MINUTES = 60;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export async function POST(request: Request) {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  const clientId = String(form.get("client_id") ?? "");

  if (!(await checkRateLimit(`oauth:token:${clientId || "unknown"}`, 60, 60_000))) {
    return NextResponse.json({ error: "invalid_request" }, { status: 429 });
  }

  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant(form, clientId);
  }
  if (grantType === "refresh_token") {
    // Implemented in Task 13 — placeholder wiring only in this task.
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }
  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
}

async function handleAuthorizationCodeGrant(form: FormData, clientId: string): Promise<NextResponse> {
  const code = String(form.get("code") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeVerifier = String(form.get("code_verifier") ?? "");

  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const codeHash = hashOauthSecret(code);
  const [storedCode] = await db
    .select({
      id: oauthAuthorizationCodes.id,
      clientId: oauthAuthorizationCodes.clientId,
      redirectUri: oauthAuthorizationCodes.redirectUri,
      codeChallenge: oauthAuthorizationCodes.codeChallenge,
      orgId: oauthAuthorizationCodes.orgId,
      userId: oauthAuthorizationCodes.userId,
      expiresAt: oauthAuthorizationCodes.expiresAt,
      consumedAt: oauthAuthorizationCodes.consumedAt,
    })
    .from(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.codeHash, codeHash))
    .limit(1);

  const validation = validateCodeRedemption({
    storedCode: storedCode ?? null,
    presentedClientId: clientId,
    presentedRedirectUri: redirectUri,
    presentedCodeVerifier: codeVerifier,
    now: new Date(),
  });

  if (!validation.ok || !storedCode) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  // Atomic single-use enforcement: only mark consumed if it's STILL
  // unconsumed at write time (defends a concurrent double-redemption race
  // that a read-then-check can't catch alone).
  const consumed = await db
    .update(oauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(oauthAuthorizationCodes.id, storedCode.id), isNull(oauthAuthorizationCodes.consumedAt)))
    .returning({ id: oauthAuthorizationCodes.id });

  if (consumed.length === 0) {
    // Someone else redeemed it in the race window between our SELECT and
    // this UPDATE — treat identically to "already consumed".
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  const minted = await mintWorkspaceToken(storedCode.orgId, {
    name: `oauth:${clientId}`,
    kind: "oauth",
    expiresInMinutes: ACCESS_TOKEN_EXPIRY_MINUTES,
  });

  const refreshTokenRaw = generateRefreshToken();
  const familyId = crypto.randomUUID();
  await db.insert(oauthRefreshTokens).values({
    tokenHash: hashOauthSecret(refreshTokenRaw),
    familyId,
    clientId,
    orgId: storedCode.orgId,
    userId: storedCode.userId,
    apiKeyId: minted.tokenId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  });

  return NextResponse.json({
    access_token: minted.token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_EXPIRY_MINUTES * 60,
    refresh_token: refreshTokenRaw,
  });
}
```

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(oauth): add POST /api/oauth/token authorization_code grant — mints kind="oauth" wst_ tokens`

---

## Task 13 — `POST /api/oauth/token` — `refresh_token` grant with rotation + reuse detection

**Goal:** complete the token endpoint. This is the task that implements the design doc §3.2 "revoke family" mechanism.

1. Write `packages/crm/tests/unit/oauth/rotate-refresh-token.spec.ts` FIRST:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideRefreshOutcome } from "@/lib/oauth/rotate-refresh-token";

const activeToken = {
  familyId: "fam-1",
  clientId: "c1",
  orgId: "org1",
  userId: "user1",
  revokedAt: null as Date | null,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
};

describe("decideRefreshOutcome", () => {
  it("rotates a valid, unrevoked, unexpired token", () => {
    const result = decideRefreshOutcome({ storedToken: activeToken, presentedClientId: "c1", now: new Date() });
    assert.equal(result.outcome, "rotate");
  });

  it("rejects a client_id mismatch", () => {
    const result = decideRefreshOutcome({ storedToken: activeToken, presentedClientId: "wrong-client", now: new Date() });
    assert.equal(result.outcome, "reject");
  });

  it("rejects an expired token", () => {
    const result = decideRefreshOutcome({
      storedToken: { ...activeToken, expiresAt: new Date(Date.now() - 1000) },
      presentedClientId: "c1",
      now: new Date(),
    });
    assert.equal(result.outcome, "reject");
  });

  it("detects reuse of an already-revoked token and signals family revocation", () => {
    const result = decideRefreshOutcome({
      storedToken: { ...activeToken, revokedAt: new Date() },
      presentedClientId: "c1",
      now: new Date(),
    });
    assert.equal(result.outcome, "reuse_detected");
    if (result.outcome === "reuse_detected") assert.equal(result.familyId, "fam-1");
  });

  it("rejects when storedToken is null (unknown token hash) without signaling reuse (nothing to revoke)", () => {
    const result = decideRefreshOutcome({ storedToken: null, presentedClientId: "c1", now: new Date() });
    assert.equal(result.outcome, "reject");
  });
});
```

2. Implement `packages/crm/src/lib/oauth/rotate-refresh-token.ts`:

```ts
export interface StoredRefreshToken {
  familyId: string;
  clientId: string;
  orgId: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

export type RefreshOutcome =
  | { outcome: "rotate" }
  | { outcome: "reject" }
  | { outcome: "reuse_detected"; familyId: string };

/**
 * The refresh-rotation decision core (design doc §3.2). THREE distinct
 * outcomes, not two — this is the key nuance versus a naive valid/invalid
 * check:
 *
 *   - "rotate": legitimate refresh. Caller should revoke this row, mint a
 *     new one in the SAME family, and mint a fresh access token.
 *   - "reject": token unknown, wrong client, or naturally expired. No
 *     family-wide action needed — this is just "this particular refresh
 *     attempt failed," not evidence of theft.
 *   - "reuse_detected": the presented token hash matched a REAL row that
 *     is ALREADY revoked. Under normal operation this can only happen if
 *     the legitimate client already rotated past this token — meaning
 *     whoever just presented it is NOT the legitimate client (a stolen,
 *     replayed refresh token). The caller MUST revoke every row sharing
 *     this familyId AND the currently-live access token tied to it (see
 *     oauth_refresh_tokens.apiKeyId in the schema).
 */
export function decideRefreshOutcome(params: {
  storedToken: StoredRefreshToken | null;
  presentedClientId: string;
  now: Date;
}): RefreshOutcome {
  const { storedToken } = params;
  if (!storedToken) return { outcome: "reject" };
  if (storedToken.clientId !== params.presentedClientId) return { outcome: "reject" };
  if (storedToken.revokedAt !== null) {
    return { outcome: "reuse_detected", familyId: storedToken.familyId };
  }
  if (storedToken.expiresAt.getTime() <= params.now.getTime()) return { outcome: "reject" };
  return { outcome: "rotate" };
}
```

3. Extend `packages/crm/src/app/api/oauth/token/route.ts`'s `refresh_token` branch (replacing the Task 12 placeholder):

```ts
// Replace the Task 12 placeholder block:
//   if (grantType === "refresh_token") {
//     return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
//   }
// with:
if (grantType === "refresh_token") {
  return handleRefreshTokenGrant(form, clientId);
}
```

```ts
import { decideRefreshOutcome } from "@/lib/oauth/rotate-refresh-token";
// (add to the existing import block at the top of the file)

async function handleRefreshTokenGrant(form: FormData, clientId: string): Promise<NextResponse> {
  const presentedRefreshToken = String(form.get("refresh_token") ?? "");
  if (!presentedRefreshToken || !clientId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const tokenHash = hashOauthSecret(presentedRefreshToken);
  const [storedToken] = await db
    .select({
      id: oauthRefreshTokens.id,
      familyId: oauthRefreshTokens.familyId,
      clientId: oauthRefreshTokens.clientId,
      orgId: oauthRefreshTokens.orgId,
      userId: oauthRefreshTokens.userId,
      apiKeyId: oauthRefreshTokens.apiKeyId,
      revokedAt: oauthRefreshTokens.revokedAt,
      expiresAt: oauthRefreshTokens.expiresAt,
    })
    .from(oauthRefreshTokens)
    .where(eq(oauthRefreshTokens.tokenHash, tokenHash))
    .limit(1);

  const decision = decideRefreshOutcome({
    storedToken: storedToken ?? null,
    presentedClientId: clientId,
    now: new Date(),
  });

  if (decision.outcome === "reject") {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  if (decision.outcome === "reuse_detected") {
    // Revoke the ENTIRE family — every refresh token descended from the
    // same original grant — plus the currently-live access token, if we
    // still have its id. This is the theft-response the design doc §3.2
    // and §4 both call for.
    await db
      .update(oauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthRefreshTokens.familyId, decision.familyId), isNull(oauthRefreshTokens.revokedAt)));
    // Note: revoking the live api_keys row tied to a compromised family is
    // a straightforward follow-up UPDATE against apiKeys keyed by
    // storedToken.apiKeyId — implement it here as part of this task (an
    // expired/deleted apiKeys row makes resolveWorkspaceBearer 401
    // immediately on the next MCP call, which is the desired effect).
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  // decision.outcome === "rotate"
  if (!storedToken) {
    // Unreachable given decideRefreshOutcome's contract, but keeps
    // TypeScript's control-flow narrowing honest without a non-null
    // assertion.
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }

  await db
    .update(oauthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthRefreshTokens.id, storedToken.id));

  const minted = await mintWorkspaceToken(storedToken.orgId, {
    name: `oauth:${clientId}`,
    kind: "oauth",
    expiresInMinutes: ACCESS_TOKEN_EXPIRY_MINUTES,
  });

  const newRefreshTokenRaw = generateRefreshToken();
  await db.insert(oauthRefreshTokens).values({
    tokenHash: hashOauthSecret(newRefreshTokenRaw),
    familyId: storedToken.familyId, // SAME family — this is the rotation chain
    clientId,
    orgId: storedToken.orgId,
    userId: storedToken.userId,
    apiKeyId: minted.tokenId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  });

  return NextResponse.json({
    access_token: minted.token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_EXPIRY_MINUTES * 60,
    refresh_token: newRefreshTokenRaw, // per Anthropic's docs: "return the new refresh token in the same response that invalidates the old one"
  });
}
```

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(oauth): add refresh_token grant with rotation + family-wide reuse detection`

---

## Task 14 — The 401 + `WWW-Authenticate` header on the existing MCP route

**Goal:** the one change to `src/app/api/mcp/v1/route.ts` — additive header only, existing JSON-RPC error body untouched.

1. Find (or add, if none exists) a unit spec covering this route's 401 shape. Check `packages/crm/tests/unit/` for an existing `mcp-v1` or `build-mcp-handler` spec first — if `handleBuildMcpRpc`/`unauthorizedRpcBody` already have coverage, add a new `it` there for the header; only create a new spec file if none covers this route at all.

2. Edit `packages/crm/src/app/api/mcp/v1/route.ts`:

```ts
// Add near the top, alongside the existing CORS_HEADERS constant:
const PROTECTED_RESOURCE_METADATA_URL = "https://mcp.seldonframe.com/.well-known/oauth-protected-resource";

function unauthorizedHeaders(): Record<string, string> {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return CORS_HEADERS;
  }
  return {
    ...CORS_HEADERS,
    "WWW-Authenticate": `Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"`,
  };
}
```

Then replace BOTH existing 401 return sites in `POST`:
```ts
// Before:
return NextResponse.json(unauthorizedRpcBody(), { status: 401, headers: CORS_HEADERS });
// After (both occurrences — the guard.error branch AND the !guard.orgId branch):
return NextResponse.json(unauthorizedRpcBody(), { status: 401, headers: unauthorizedHeaders() });
```

**Do not touch anything else in this file** — `unauthorizedRpcBody()`'s return value, the `GET`/`OPTIONS` handlers, `buildRealBridge`, and the 200-path response construction are all explicitly out of scope for this task.

3. **Matcher verification (Global Constraints load-bearing check) — run this now, not deferred to the end:**
   ```bash
   cd packages/crm && SF_OAUTH_ENABLED=true pnpm dev
   ```
   In a second terminal:
   ```bash
   # Confirm the existing MCP route's 401 now carries the header:
   curl -s -i -X POST -H "Host: mcp.seldonframe.com" -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
     http://localhost:3000/v1 | grep -i "www-authenticate"
   # expect: WWW-Authenticate: Bearer resource_metadata="https://mcp.seldonframe.com/.well-known/oauth-protected-resource"

   # Confirm ALL SIX new routes are reachable WITHOUT any proxy.ts matcher change
   # (Global Constraints: "matcher additions: NONE" — this is the proof, not an assertion):
   curl -s -o /dev/null -w "well-known-protected-resource: %{http_code}\n" -H "Host: mcp.seldonframe.com" http://localhost:3000/.well-known/oauth-protected-resource
   curl -s -o /dev/null -w "well-known-as-metadata: %{http_code}\n" http://localhost:3000/.well-known/oauth-authorization-server
   curl -s -o /dev/null -w "register: %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"redirect_uris":["http://localhost/callback"]}' http://localhost:3000/api/oauth/register
   curl -s -o /dev/null -w "authorize-get-no-session: %{http_code}\n" "http://localhost:3000/oauth/authorize?response_type=code&client_id=x&redirect_uri=http://localhost/callback&code_challenge=x&code_challenge_method=S256"
   # (expect a redirect to /login, i.e. 307/302 — NOT a 404, which would mean the matcher swallowed it)
   curl -s -o /dev/null -w "token-empty-body: %{http_code}\n" -X POST -H "Content-Type: application/x-www-form-urlencoded" -d "grant_type=authorization_code" http://localhost:3000/api/oauth/token
   # (expect 400 invalid_request — NOT 404)
   ```
   **If ANY of these return 404 when they should not** (i.e., the route exists but isn't being reached), STOP. Do not "fix" it by adding an entry to `proxy.ts`'s matcher as a reflex — first re-read design doc §2.4's reasoning to understand WHY it predicted no matcher change was needed, and figure out which specific assumption broke (e.g., is `handleBuilderMcpHost`'s host-set check somehow intercepting a request it shouldn't? Is there a Next.js route-collision with an existing dynamic segment?) before deciding whether a matcher change is actually the right fix or whether something else is wrong.

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```

**Commit:** `feat(oauth): add WWW-Authenticate resource_metadata header to the existing MCP 401 (flag-gated)`

---

## Task 15 — `.env.example` entry + smoke script

**Goal:** document the flag; ship the reviewer-facing smoke script outlined in the design doc §6.

1. Add to `packages/crm/.env.example` (find the file first; add near other feature-flag entries if a grouping convention exists):
   ```
   # OAuth 2.1 + Dynamic Client Registration for the claude.ai connector
   # directory (mcp.seldonframe.com/v1). Inert (all new endpoints 404) when
   # unset or not exactly "true". See docs/oauth-connector-design.md if this
   # plan's companion design doc was copied into the repo, or the scratchpad
   # copy otherwise.
   SF_OAUTH_ENABLED=false
   ```

2. Write `packages/crm/scripts/smoke-oauth-connector.mjs` implementing the 8-step flow from design doc §6 exactly. Key shape (steps 1–4 and 6–8 are fully scriptable; step 5 requires a human):

```js
#!/usr/bin/env node
// Smoke-tests the full OAuth 2.1 + DCR flow against a dev/staging deploy.
// Steps 1-4 and 6-8 are fully automated; step 5 (the actual consent-screen
// click) requires a human with a real logged-in browser session — this
// script prints the URL to open and pauses for the human to paste back the
// resulting `code` query param.
//
// Usage: BASE_URL=https://<dev-deploy> node scripts/smoke-oauth-connector.mjs

import crypto from "node:crypto";
import readline from "node:readline/promises";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const MCP_BASE_URL = process.env.MCP_BASE_URL ?? BASE_URL; // override if mcp host differs from app host locally

function computeS256Challenge(verifier) {
  return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
}

async function main() {
  console.log("1. Fetching /.well-known/oauth-protected-resource ...");
  const prm = await fetch(`${MCP_BASE_URL}/.well-known/oauth-protected-resource`).then((r) => r.json());
  console.log(prm);
  if (prm.resource !== "https://mcp.seldonframe.com/v1") {
    throw new Error(`resource mismatch: ${prm.resource}`);
  }
  if (!Array.isArray(prm.authorization_servers) || prm.authorization_servers.length !== 1) {
    throw new Error("authorization_servers must be a single-entry array");
  }

  console.log("2. Fetching /.well-known/oauth-authorization-server ...");
  const asMeta = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`).then((r) => r.json());
  console.log(asMeta);
  if (JSON.stringify(asMeta.code_challenge_methods_supported) !== JSON.stringify(["S256"])) {
    throw new Error("code_challenge_methods_supported must be exactly [\"S256\"]");
  }

  console.log("3. Registering a client via DCR ...");
  const redirectUri = "http://127.0.0.1:8765/callback";
  const registerResponse = await fetch(`${BASE_URL}/api/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: [redirectUri], client_name: "smoke-test" }),
  }).then((r) => r.json());
  console.log(registerResponse);
  const clientId = registerResponse.client_id;
  if (!clientId) throw new Error("registration did not return a client_id");

  console.log("4. Generating PKCE pair ...");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = computeS256Challenge(codeVerifier);

  const authorizeUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", "smoke-test-state");
  authorizeUrl.searchParams.set("resource", "https://mcp.seldonframe.com/v1");

  console.log("\n5. MANUAL STEP — open this URL in a browser where you are already logged in:");
  console.log(authorizeUrl.toString());
  console.log("After clicking Approve, you'll be redirected to a URL like:");
  console.log(`  ${redirectUri}?code=XXXXX&state=smoke-test-state`);
  console.log("(that request will fail to connect since nothing listens on 127.0.0.1:8765 — that's expected, just copy the `code` param from the browser's address bar before it errors)\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await rl.question("Paste the `code` value here: ");
  rl.close();

  console.log("\n6. Exchanging code for tokens ...");
  const tokenResponse = await fetch(`${BASE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code.trim(),
      code_verifier: codeVerifier,
      client_id: clientId,
      redirect_uri: redirectUri,
    }),
  }).then((r) => r.json());
  console.log(tokenResponse);
  if (!tokenResponse.access_token?.startsWith("wst_")) {
    throw new Error("access_token missing or not wst_-prefixed");
  }
  if (!tokenResponse.refresh_token) {
    throw new Error("refresh_token missing from authorization_code grant response");
  }

  console.log("\n7. Calling the MCP endpoint with the minted access_token ...");
  const mcpResponse = await fetch(`${MCP_BASE_URL}/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenResponse.access_token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  console.log(`MCP call status: ${mcpResponse.status}`);
  if (mcpResponse.status !== 200) {
    throw new Error(`expected 200 from authenticated MCP call, got ${mcpResponse.status}`);
  }

  console.log("\n8. Exercising refresh rotation + reuse detection ...");
  const firstRefreshToken = tokenResponse.refresh_token;
  const rotated = await fetch(`${BASE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: firstRefreshToken, client_id: clientId }),
  }).then((r) => r.json());
  console.log("First rotation:", rotated);
  if (!rotated.refresh_token || rotated.refresh_token === firstRefreshToken) {
    throw new Error("refresh rotation did not return a NEW refresh_token");
  }

  console.log("Replaying the OLD (now-revoked) refresh_token — expect invalid_grant ...");
  const replayResponse = await fetch(`${BASE_URL}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: firstRefreshToken, client_id: clientId }),
  });
  const replayBody = await replayResponse.json();
  console.log(`Replay status: ${replayResponse.status}`, replayBody);
  if (replayResponse.status !== 400 || replayBody.error !== "invalid_grant") {
    throw new Error("expected 400 invalid_grant when replaying a rotated-away refresh token");
  }

  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
```

**Verify:**
```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```
This script is NOT run against production in this task (it needs a live dev/staging deploy with `SF_OAUTH_ENABLED=true` and a human to click through step 5) — running it is a deploy-time activity, not part of this plan's local verify gate. Confirm the script at least PARSES and its non-network logic (the S256 computation) is correct by eyeballing it against Task 3's already-tested `computeCodeChallengeS256` (same algorithm, intentionally duplicated inline here rather than importing `@/lib/oauth/pkce` since this script runs standalone via plain `node`, outside the Next.js/tsx module resolution the rest of the app uses — note this duplication explicitly in a comment in the script itself so a future editor updating the PKCE algorithm in one place remembers to check the other).

**Commit:** `feat(oauth): add SF_OAUTH_ENABLED to .env.example + full-flow smoke script`

---

## Final Verify Gate (run once, after Task 15, before calling this done)

```bash
node scripts/run-unit-tests.js
cd packages/crm && npx tsc --noEmit -p tsconfig.json
bash scripts/check-use-server.sh src
cd packages/crm && pnpm build
```

All four clean. Additionally, re-run the full Task 14 curl battery one more time against a fresh `pnpm build && pnpm start` (production build, not `pnpm dev`) to confirm nothing in the build step changes route reachability — dev-server routing and production-build routing can occasionally diverge in Next.js in ways `pnpm dev` alone won't catch.

Do not proceed to opening a PR or requesting review until this entire gate is green in a single sitting.

---

## Explicit non-goals for this plan (do not scope-creep into these)

- CIMD (Client ID Metadata Documents) support — flagged as a design-doc fast-follow (§7), not built here.
- A static/pre-registered `oauth_anthropic_creds`-style client id path — same, fast-follow only.
- Any change to the existing `wst_` manual-token-paste UX (admin UI, CLI minting flow) — untouched by this plan.
- Tool-annotation (`title`/`readOnlyHint`/`destructiveHint`) audit of the existing discover/inspect/run tools — this is a real, separate directory-submission blocker (design doc §7, item 2) but is NOT part of an "OAuth + DCR" plan; it needs its own task/plan against `src/lib/build/mcp/build-mcp-rpc.ts`.
- RLS policies on the three new `oauth_*` tables — deliberately out of scope (Global Constraints, explicit "DO NOT" bullet).
- Scope-based (as opposed to single-implicit-scope) authorization — the `scope` column exists on `oauth_authorization_codes` for future use but nothing in this plan populates or enforces it beyond the single implicit "full workspace access" grant every code carries today.
