# Staging first-run runbook — v3 (Path B: LLM-free backend)

Step-by-step to validate the full SeldonFrame zero-friction chain end-to-end on staging.

**Estimated time:** 15–30 minutes (down from ~60 — no Anthropic, no Upstash required).
**Output:** Pass/fail report + `workspace_id` for cleanup.
**Last updated:** 2026-04-19 (post Path-B refactor).

For the one-page "what do I need to do" view, open
[STAGING_READINESS_CHECKLIST.md](STAGING_READINESS_CHECKLIST.md).

---

## Architecture reminder

Natural-language reasoning happens in **Claude Code** (the user's side, using
their own Claude subscription). The **SeldonFrame backend** accepts structured
commands only — no server-side LLM calls on the first-run chain, ever.

This means:

- No `ANTHROPIC_API_KEY` required on the backend
- No LLM spend cap, no metering
- Test runs in 2–3 minutes with pure DB + HTTP assertions

---

## 0. Prereqs

- SSH / Vercel CLI access to the staging project
- Staging `DATABASE_URL` (direct Postgres, not the pooler if possible)
- DNS control over `app.seldonframe.com` (for wildcard check)
- A real user account on staging you can sign in with (optional — only for the
  post-claim admin URL spot-check)

```bash
git branch --show-current   # the branch with all the slices
git status                  # clean or stable
```

---

## 1. Run the DB migration on staging

**One new migration since launch: `0015_workspace_bearer_tokens.sql`** — adds
`api_keys.kind` column and backfills `'user'` on existing rows.

```bash
cd packages/crm
DATABASE_URL="postgres://…staging…" pnpm db:migrate
```

Expect:

```
0015_workspace_bearer_tokens ✓
```

### Verify

```bash
psql "$DATABASE_URL" -c "SELECT kind, COUNT(*) FROM api_keys GROUP BY kind;"
```

All existing rows should report `kind = 'user'`. If the column doesn't exist,
**stop** — the deploy will 500 on every `create_workspace`.

### Troubleshooting

- Drizzle auto-generates a rival migration → `pnpm db:generate --verbose`,
  inspect the diff, abort if it tries to DROP `kind`.
- "Already applied" → fine. Run the verify query.

---

## 2. Vercel env vars

Set in Vercel → Project → Environment Variables (staging env):

| Key | Value | Required? | Why |
|---|---|---|---|
| `DATABASE_URL` | staging Postgres URL | ✅ | Everything |
| `NEXTAUTH_URL` | `https://app.seldonframe.com` | ✅ | Admin login flow + switch-workspace |
| `NEXTAUTH_SECRET` | existing secret | ✅ | Session signing |
| `WORKSPACE_BASE_DOMAIN` | `app.seldonframe.com` | ✅ | Subdomain URLs + proxy rewrites |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` | Upstash creds | ⚠️ Optional | Distributed rate limiting; in-memory fallback is fine for staging |
| `ANTHROPIC_API_KEY` | — | ❌ **No longer needed** | The zero-friction chain is LLM-free server-side |

After setting, trigger a redeploy.

---

## 3. Wildcard DNS

Vercel → Project → Settings → Domains:

1. Add `*.app.seldonframe.com` as a wildcard.
2. Add the `CNAME *` record at your DNS provider (`cname.vercel-dns.com`).
3. Wait for Vercel to show "Valid Configuration" (2–15 min).

### Check

```bash
dig +short foo.app.seldonframe.com
# expect a Vercel target, not NXDOMAIN
```

If DNS isn't live yet, run the smoke test with `SKIP_PUBLIC_URL_CHECKS=1`
(the public-URL checks get skipped; everything else still runs).

---

## 4. Deploy

```bash
git push origin <your-branch>
# Or:
vercel --target=staging
```

Wait for green. Copy the preview URL (e.g. `https://staging.app.seldonframe.com`
or `https://crm-git-<branch>-<team>.vercel.app`).

### Smoke before running the test

```bash
curl -sS "https://<deploy>/api/v1/workspaces" -H "Authorization: Bearer wst_fake"
# expect: 401 {"error":"credentials rejected ..."}
# proves: routes are live + auth middleware is wired
```

---

## 5. Run the smoke test

From your laptop:

```bash
cd /path/to/repo

# Standard staging run — zero Anthropic dependency
API_BASE=https://staging.app.seldonframe.com/api/v1 \
pnpm test:first-run
```

### What the test covers (17 assertions)

| Step | Endpoint | Proves |
|---|---|---|
| 1 | `POST /workspace/create` | Migration + bearer mint + URLs returned |
| 2 | `POST /packs/caldiy-booking/install` | Block flag + default booking template inserted |
| 3 | `POST /packs/formbricks-intake/install` | Same for intake |
| 4 | `POST /soul/submit` | Structured Soul write |
| 5 | `POST /landing/update` | Typed landing rewrite |
| 6 | `POST /intake/customize` | Typed intake field replacement |
| 7 | `POST /booking/configure` | Typed booking edit |
| 8 | `POST /theme/update` | Typed theme update |
| 9 | `GET /workspace/[id]/snapshot` | Read-only snapshot includes soul + counts + URLs |
| 10 | `GET /workspaces` (bearer) | Bearer-scoped read returns exactly 1 org |
| 11 | `POST /workspace/[id]/link-owner` without user | 401 (claim requires user identity) |
| 12 | `POST /workspace/[id]/revoke-bearer` without auth | 401 |
| 13 | `POST /workspace/[id]/revoke-bearer` bogus token_id | 404 (no enumeration oracle) |
| 14 | `GET /switch-workspace` without session | 302 to `/login` |
| 15–17 | GET `/`, `/book`, `/intake` on subdomain | Wildcard DNS + proxy rewrites + templates |

### Expected clean output

```
→ First-run smoke against https://staging.app.seldonframe.com/api/v1
  skip_public=false
  workspace_name="First-Run Test 1775880112000"

✅ anonymous create_workspace — status=200 id=<uuid> slug=first-run-test-1775880112000 bearer=wst_Ab…
✅ install_caldiy_booking — status=200 template={"slug":"default","title":"Book a call","already_existed":false}
✅ install_formbricks_intake — status=200 template={"slug":"intake","name":"Get in touch","already_existed":false}
✅ soul/submit — status=200 bytes=315
✅ landing/update — status=200 applied={"headline":"Dental Care in Laval","subhead_preview":"Book your next…"}
✅ intake/customize — status=200 applied={"field_count":4,"field_keys":["full_name","email","phone","service"]}
✅ booking/configure — status=200 applied={"title":"Initial consultation","duration_minutes":45,"description_updated":true}
✅ theme/update — status=200 applied={"mode":"dark","primary_color":"#d97706","font_family":"Outfit"}
✅ workspace snapshot — status=200 entities={"contacts":0,"bookings_real":0,"bookings_template":1,"intake_forms":1,"intake_submissions":0} soul.submitted=true
✅ list_workspaces (bearer) — status=200 count=1 id_match=true
✅ link-owner without user identity → 401 — status=401 error=Ownership link requires a user identity…
✅ revoke-bearer without auth → 401 — status=401 error=Unauthorized
✅ revoke-bearer with bogus token_id → 404 — status=404 error=Token not found or already revoked.
✅ switch-workspace without session → /login — status=307 location=/login?next=…
✅ public url [home] — https://…app.seldonframe.com/ → 200
✅ public url [book] — https://…app.seldonframe.com/book → 200
✅ public url [intake] — https://…app.seldonframe.com/intake → 200

→ Captured workspace_id=<uuid> — clean up manually when done.

—— 17/17 passed (0 skipped) ——
```

### Useful env overrides

```bash
# DNS not live yet → skip public URL checks (still 14/17 pass)
SKIP_PUBLIC_URL_CHECKS=1 API_BASE=… pnpm test:first-run

# Pin a named run (useful when debugging multiple attempts)
TEST_WORKSPACE_NAME="Smoke 2026-04-19 AM" API_BASE=… pnpm test:first-run
```

---

## 6. Manual browser spot-checks

After the automated pass, open in a fresh incognito:

1. `https://<slug>.app.seldonframe.com/` — landing renders with the LLM-customized headline ("Dental Care in Laval")
2. `https://<slug>.app.seldonframe.com/book` — booking form with "Initial consultation", 45-min
3. `https://<slug>.app.seldonframe.com/intake` — intake with the 4 customized fields
4. Admin URL from `create_workspace` response (e.g. `https://app.seldonframe.com/switch-workspace?to=<id>&next=/dashboard`)
   - Should redirect to `/login?next=/switch-workspace…`
   - Sign in as a real user
   - Lands on `/dashboard` with `sf_active_org_id` cookie set to the linked workspace

---

## 7. Send back

Paste:

1. **Migration output** — `pnpm db:migrate` + verify query
2. **Test output** — full stdout including any ❌ blocks
3. **Manual spot-check notes** — which URLs worked, screenshots of anything odd
4. **Captured `workspace_id`**
5. If failed: Vercel deploy ID + browser console errors from §6

---

## 8. Cleanup

```bash
psql "$DATABASE_URL" -c "DELETE FROM organizations WHERE name LIKE 'First-Run Test %';"
# Cascades clean up api_keys, bookings, intake_forms, landing_pages, org_members.
```

---

## Known caveats going in

- **In-memory rate limiter without Upstash** — resets on every Vercel function cold start. Fine for this smoke (well under any cap); not fine for scaled abuse testing.
- **Magic-link post-claim sign-in** — not yet implemented. After `link_workspace_owner` the user signs in manually; `/switch-workspace` handles the post-signin redirect correctly.
- **`seldon_it_events` in the snapshot** — legacy bag name retained so historical rows from the dashboard Seldon It action still surface. The new typed MCP tools don't write to it.
- **Backend Anthropic dependency** — `@anthropic-ai/sdk` is still in `packages/crm/package.json` for 8 legacy code paths (BYOK Soul compile, soul-wiki, brain-compiler, analyze-url). None are on the first-run chain. Removing the dep entirely is a separate multi-week refactor.
