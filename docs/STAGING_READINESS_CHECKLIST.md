# Staging readiness checklist — v3 (Path B)

One-page scan of what you need on your side to prove the zero-friction first-run
flow works end-to-end. Post Path-B refactor: backend is LLM-free, so there's
less infra to stand up.

**Target time: 15–30 minutes.**

## 1. Database ✅

- [ ] Staging `DATABASE_URL` copied from Vercel env
- [ ] Ran `pnpm db:migrate` from repo root with `DATABASE_URL` set in the shell
- [ ] Verified: `SELECT kind, COUNT(*) FROM api_keys GROUP BY kind;` returns rows (no "column does not exist" error)

**Shell-specific env syntax (pick one):**

```bash
# bash / zsh (macOS / Linux / WSL)
export DATABASE_URL="<string>" && pnpm db:migrate
```

```powershell
# Windows PowerShell
$env:DATABASE_URL = "<string>"; pnpm db:migrate
```

```cmd
:: Windows cmd.exe
set DATABASE_URL=<string> && pnpm db:migrate
```

**If this fails** → every `create_workspace` call 500s.

## 2. Vercel env vars ✅

Set in Vercel staging:

- [ ] `DATABASE_URL`
- [ ] `NEXTAUTH_URL` = `https://app.seldonframe.com`
- [ ] `NEXTAUTH_SECRET`
- [ ] `WORKSPACE_BASE_DOMAIN` = `app.seldonframe.com`
- [ ] *(optional)* `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

**NOT required:** `ANTHROPIC_API_KEY` — the first-run chain is server-side LLM-free.

**Then:** trigger a Vercel redeploy so the new env loads.

## 3. Wildcard DNS ✅

- [ ] `*.app.seldonframe.com` added as Vercel project domain
- [ ] DNS `CNAME *` record at your provider → `cname.vercel-dns.com`
- [ ] `dig +short foo.app.seldonframe.com` returns a Vercel target
- [ ] Vercel shows "Valid Configuration"

**If DNS isn't live** → run the smoke with `SKIP_PUBLIC_URL_CHECKS=1` (14 of 17 checks still pass).

## 4. Deploy ✅

- [ ] Latest branch pushed to the staging target
- [ ] Deploy shows green in Vercel
- [ ] Pre-check: `curl -sS "https://<deploy>/api/v1/workspaces" -H "Authorization: Bearer wst_fake"` returns **401** (proves routes + auth are live)

## 5. Run the smoke ✅

From your laptop:

```bash
API_BASE=https://staging.app.seldonframe.com/api/v1 pnpm test:first-run
```

Expected: **17/17 passed** in 2–3 minutes.

- [ ] All ✅, zero ❌
- [ ] Copy full stdout including the `workspace_id` line at the end

## 6. Manual browser pass ✅

Incognito window:

- [ ] `https://<slug>.app.seldonframe.com/` renders (dark theme, LLM-written headline)
- [ ] `https://<slug>.app.seldonframe.com/book` renders the "Initial consultation" (45-min) booking
- [ ] `https://<slug>.app.seldonframe.com/intake` renders 4 customized fields
- [ ] Admin URL from `create_workspace` response → `/login` → signin → lands on the linked workspace

## 7. Send back ✅

- [ ] Output of `SELECT kind, COUNT(*) FROM api_keys GROUP BY kind;`
- [ ] Full `pnpm test:first-run` stdout
- [ ] Any ❌ with error text
- [ ] Manual pass notes / screenshots
- [ ] Captured `workspace_id`

## 8. Cleanup ✅

```bash
psql "$DATABASE_URL" -c "DELETE FROM organizations WHERE name LIKE 'First-Run Test %';"
```

---

## The iteration loop

```
push branch → Vercel preview deploy → migration → smoke test → paste output → debug
```

You don't need to push to main for staging. Vercel previews work for everything
except wildcard DNS (which is tied to production domain). If you want to exercise
the public URL rendering checks, you'll need to either:

- Promote a tested preview to the production alias, OR
- Point `app.seldonframe.com` at a preview URL temporarily

Easier: pass `SKIP_PUBLIC_URL_CHECKS=1` for preview runs, then drop it once
merging to main.

---

## Common failure modes and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `anonymous create_workspace` 500s | Migration didn't run | Step 1 |
| `anonymous create_workspace` 401 | Legacy auth path triggered — body might have `url`/`description` instead of `name` | Check request body is `{name: "...", source: "..."}` only |
| `landing/update` / `intake/customize` etc. return 403 "You do not manage this workspace" | User identity + explicit `workspace_id` user doesn't actually manage | Pass `workspace_id` that matches the user's org, or use bearer identity |
| `public url [home]` fails with DNS error | Wildcard DNS not live | Step 3, or `SKIP_PUBLIC_URL_CHECKS=1` |
| `public url [book]` returns 404 | `createDefaultBookingTemplate` didn't fire (check Vercel logs for that workspace_id) | Usually a DB connection error — redeploy |
| `workspace snapshot` returns `soul.submitted: false` | `/soul/submit` failed silently earlier | Look for the `soul/submit` step in the test output |
| `switch-workspace` without session returns 200 instead of 302 | `NEXTAUTH_URL` wrong or not set | Step 2 |

---

## Minimal-effort variant (if you want a fast first signal)

Just want to see the API chain move without caring about URLs:

```bash
SKIP_PUBLIC_URL_CHECKS=1 \
API_BASE=<your-preview-deploy>/api/v1 \
pnpm test:first-run
```

Validates: DB migration, bearer auth, all 4 typed customizers, snapshot, claim gate, revocation gate, membership guards. 14 of 17 assertions. Takes ~90 seconds. Add public URL checks after DNS lands.
