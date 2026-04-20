# Secrets encryption audit — Phase 2.5.d

**Mode:** read-only. No code changes.
**Date:** 2026-04-20
**Question (D-10 from v1-master-plan):** is per-workspace BYO API key storage (`workspace_secrets`) encrypted at rest properly, and is the crypto infrastructure ready for Phase 3-5 (Email / SMS / Payments BYO keys)?

## Verdict: **Solid. No work needed before Phase 3.**

Existing infrastructure encrypts at rest with AES-256-GCM, has per-secret random IV + auth tag, access-controlled reads, audit timestamps, fingerprinting without decryption, rotation plumbing, and a signed out-of-band capture link flow. Mature design; better than what most Phase 3+ blocks will need.

The only open risk is operational — verify `ENCRYPTION_KEY` is set in Vercel env (if it weren't, writes would already throw). Not a code risk.

---

## What exists

### `packages/crm/src/lib/encryption.ts` (57 LOC)

Pure AES-256-GCM encryption primitive:

- **Key derivation** from `process.env.ENCRYPTION_KEY`. If the raw value decodes from base64 to exactly 32 bytes, use directly; otherwise SHA-256 the raw string to get a 32-byte key. Supports both `base64(32 random bytes)` and "human passphrase" key formats. Fails loud if env unset.
- **`encryptValue(value)`** → AES-256-GCM with a fresh 12-byte random IV per call, returns `v1.<iv>.<tag>.<ciphertext>` in base64url. Auth tag is the 16-byte GCM MAC — tampering detection built in.
- **`decryptValue(payload)`** → splits on `.`, validates version prefix, runs GCM in reverse, verifies tag (throws on mismatch). Correct.
- **`redactApiKey(value)`** → `"sk-ab...cdef"` style redaction for UI display. Only first 7 + last 4 characters shown; shorter keys get `"••••••••"`.

Prefix `v1` allows future format migration without breaking existing payloads.

### `packages/crm/src/db/schema/workspace-secrets.ts` (31 LOC)

Storage schema:

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid pk | — |
| `workspace_id` | uuid FK → organizations(id) on delete CASCADE | tenant boundary |
| `scope` | text default `'workspace'` | `'workspace'` \| `'org'` |
| `service_name` | text | `'resend'`, `'twilio'`, `'stripe'`, etc. |
| **`encrypted_value`** | text (non-null) | `v1.<iv>.<tag>.<ciphertext>` — **never plaintext** |
| `key_version` | int default 1 | rotation marker (not yet wired, column ready) |
| `created_by` / `updated_by` | uuid FK → users(id) on delete SET NULL | audit |
| `created_at` / `updated_at` / `last_used_at` | timestamptz | audit + staleness signal |
| `fingerprint` | text | HMAC-SHA256 of plaintext, first 16 hex chars → detect "is this the same key we already have" without decryption |

Indexes: on `workspace_id`, on `service_name`, + `UNIQUE (workspace_id, scope, service_name)` — one secret per service per scope per workspace.

### `packages/crm/src/lib/secrets.ts` (371 LOC)

Service-level API:

- **`storeSecret(input)`** — upserts. Always encrypts via `encryptValue`; always updates `key_version` / `fingerprint` / `updated_by`. Idempotent — same service name + workspace + scope replaces the encrypted value; no "add another row" confusion.
- **`getSecretValue(input)`** — decrypts on read. Bumps `last_used_at` as a side-effect for audit. Callers can set `skipAccessCheck: true` when called from an already-authorized path (e.g., cron job) — otherwise runs `assertWorkspaceSecretAccess`.
- **`listSecrets(input)`** — returns **metadata only** (id, scope, service, keyVersion, fingerprint, timestamps). **No plaintext. No ciphertext.** Safe for `/settings/integrations` cards.
- **`rotateSecret(input)`** — deletes existing row, returns a signed `captureUrl` for the user to re-enter via the out-of-band UI. Prevents the MCP surface from ever seeing plaintext during rotation.
- **`assertWorkspaceSecretAccess`** — checks owner/parent/member before any read or write. Uses `orgMembers` + `organizations.ownerId` + `organizations.parentUserId`, same pattern as v1 identity guards.
- **Fingerprint key fallback chain**: `SELDON_SECRET_FINGERPRINT_SECRET` → `SELDON_SECRET_CAPTURE_SECRET` → `ENCRYPTION_KEY` → `NEXTAUTH_SECRET`. Throws if all unset.
- **Capture link signing**: HMAC over a base64url JSON payload. 15-min default expiry. `verifySecretCaptureToken` uses `crypto.timingSafeEqual` — no timing attack. Expiry check + payload validation.

### Consumers (encryption in flight)

| File | Use |
|---|---|
| `app/api/v1/integrations/route.ts` | 3 × `encryptValue` on write, `decryptValue` on read |
| `lib/ai/client.ts` | `decryptValue` of BYO Claude API key |
| `lib/emails/actions.ts` | `decryptValue` of Resend / SendGrid / Postmark key |
| `lib/integrations/actions.ts` | full CRUD via encryption helpers + `redactApiKey` for display |

Every consumer goes through `lib/secrets.ts` or raw `encrypt/decrypt`. No plaintext in the DB anywhere I can find.

## Capability matrix (from v1-master-plan §D-10)

| Capability | Status | Notes |
|---|---|---|
| Encryption at rest | ✅ | AES-256-GCM, random IV per secret, 16-byte auth tag |
| Per-secret unique IV | ✅ | `crypto.randomBytes(12)` on every `encryptValue` call |
| Authenticated encryption (tamper detection) | ✅ | GCM mode; auth tag verified in `decryptValue` |
| Access control on reads | ✅ | `assertWorkspaceSecretAccess` — owner / parent / member only |
| Audit trail | ✅ | `created_by`, `updated_by`, `last_used_at` |
| Key rotation primitive | ⚠️ Partial | `key_version` column exists + `rotateSecret` helper, but only one key version has ever been used. Key-rotation ceremony (re-encrypt all rows with new key, bump version) not yet scripted. Ships when someone actually needs to rotate `ENCRYPTION_KEY`. |
| Out-of-band secret capture (so MCP never sees plaintext) | ✅ | Signed capture-link flow via `/settings/integrations/secrets/capture` |
| Fingerprint without decryption | ✅ | HMAC-SHA256 truncated to 16 hex chars |
| Per-workspace isolation | ✅ | `workspace_id` FK + access check |
| Unique-per-service constraint | ✅ | `UNIQUE(workspace_id, scope, service_name)` |

## Verification I can't do from here

- **Is `ENCRYPTION_KEY` actually set in Vercel prod env?** Yes — existing production workspaces have stored secrets (confirmed earlier via `list_secrets` MCP tool in this session), so encryption is working. If the env var were missing, every write would throw and the app would have been broken long before now.

## Implications for Phase 3+

| Phase | Credential to store | Hook point |
|---|---|---|
| Phase 3 Email | Resend / SendGrid / Postmark API key | `storeSecret({ serviceName: 'resend' \| 'sendgrid' \| 'postmark', ... })` — already used by `lib/emails/actions.ts:144` for Resend today. |
| Phase 4 SMS | Twilio account SID + auth token | Two secrets: `twilio_account_sid` + `twilio_auth_token`. Or one JSON blob as `twilio`. Pick at Phase 4 kickoff. |
| Phase 5 Payments | Stripe secret key (per workspace) | `stripe_secret_key` for platform-less direct integration; or Stripe Connect OAuth tokens if Connect topology is picked per D-3. |
| Phase 10 Postiz + Documenso | API keys | `postiz` + `documenso_api_key`. |
| Phase 2.5.c unified integration UX | all of the above | Calls `listSecrets` for the cards, `storeSecret` on connect, `rotateSecret` on disconnect+reconnect, `getSecretValue` from any downstream server-side action. |

Every Phase 3-7 block should call through `lib/secrets.ts`, not `lib/encryption.ts` directly. The former handles access checks + audit + fingerprint; the latter is the pure crypto primitive for special cases.

## Open risks (all low for v1)

- **R-1: Key rotation not scripted.** If `ENCRYPTION_KEY` is ever compromised, rotating requires writing a one-off migration that re-encrypts every row. Not urgent; track for Phase 12 hardening.
- **R-2: `getSecretValue` bumps `last_used_at` on every read.** Creates a write per read. Fine at current volume (O(1) per request); revisit if a block reads the same secret many times per request.
- **R-3: `skipAccessCheck: true` parameter exists.** Dangerous if called with untrusted input. Grep shows it's only used from cron / internal paths. Document the constraint in `AGENTS.md` so no one adds it to an HTTP handler.
- **R-4: No rate limiting on `assertWorkspaceSecretAccess`.** A malicious caller could try to enumerate workspaces they don't have access to. Minor; v1 accepts.

## Not in scope for this audit

- Writing tests (the primitive has obvious correctness; integration tests exist elsewhere).
- Building the "integration card" UI — that's slice 2.5.c.
- Wiring key rotation ceremony — Phase 12 hardening.

## Decisions locked for Phase 3+

Every new block that needs a BYO credential:

1. Store via `storeSecret({ workspaceId, serviceName: '<lowercased-service-name>', value, scope: 'workspace', actorUserId })`.
2. Retrieve server-side via `getSecretValue({ workspaceId, serviceName, scope: 'workspace' })`. Check return for null (= not configured).
3. List on `/settings/integrations` via `listSecrets({ workspaceId, scope: 'workspace' })` — metadata only; never show plaintext or ciphertext.
4. Rotate via `rotateSecret({ ... })` + follow the returned capture URL to re-enter.
5. Use the `service_name` string for dispatch in code. Stable across versions; avoid renames.

2.5.c unified integration UX will formalize this as a typed list in `lib/integrations/catalog.ts` or similar.
