# Post-launch polish backlog

Items surfaced during the L-29 cleanroom test sequence and the
`claude/pre-launch-polish` branch but explicitly deferred until after
launch. Each one is small/cosmetic; none block the launch sign-off.

When picking these up, file as discrete PRs (one per item) so each lands
with its own review + Vercel preview.

---

## P2-1 — Booking page (`/book`) theme inheritance

**Surface:** workspace booking page rendered via Cal.diy block.

**Issue:** the booking page renders with a light/white theme even when the
workspace home page (`/`) and intake form (`/intake`) use the dark theme.
This is visually inconsistent — same workspace, three different chrome
treatments.

**Why deferred:** likely requires propagating the workspace's
`PublicThemeProvider` context into the Cal.diy block's render tree, OR
configuring Cal.diy's theme prop based on `organizations.theme`. Either
path needs deeper investigation than the polish branch had time for.

**Repro:**
1. `create_workspace({ name: "Theme Test" })`
2. Visit `https://theme-test.app.seldonframe.com/` — dark theme
3. Visit `https://theme-test.app.seldonframe.com/book` — light theme

**Suggested fix:** extend `PublicThemeProvider` to wrap the booking route's
render tree, OR pass a `theme` prop to the Cal.diy embed based on the
workspace's stored theme.

---

## P2-2 — Default booking availability empty state

**Surface:** workspace booking page when no availability is configured.

**Issue:** brand-new workspaces show "No times available. Try another day."
when a customer visits `/book` before any availability is set up. This is
technically accurate but feels like the booking system is broken rather
than not-yet-configured.

**Why deferred:** requires distinguishing "no availability configured" vs
"availability configured but no slots in the visible window" — currently
the calendar treats them the same.

**Suggested fix:** if `bookingTemplate.availability` is empty (the seed
default), show a "Set up your schedule in admin → bookings" prompt for
operators OR a friendlier "We're not booking yet — leave us a note" CTA
for customers.

---

## P2-3 — Operator entry point on workspace home page

**Surface:** workspace home page (`<slug>.app.seldonframe.com/`).

**Issue:** when an operator visits their own workspace's home page, there
is no obvious link to the admin dashboard. They have to memorize or paste
`app.seldonframe.com/switch-workspace?to=...&next=/dashboard`, or rely on
the response from the most recent `create_workspace` MCP call.

**Why deferred:** the workspace subdomain is intentionally customer-facing
and should not leak admin chrome to anonymous visitors. Adding a
session-aware "Are you the operator?" link requires reading auth cookies
on the public render path, which currently isn't done by design.

**Suggested fix:** read the `next-auth.session-token` cookie on the public
render. If present AND the session user is a member of the workspace's
org, render a small footer link "Admin →" pointing at
`https://app.seldonframe.com/switch-workspace?to=<orgId>&next=/dashboard`.
Should NOT render anything for anonymous visitors.

Partial mitigation already shipped in `claude/pre-launch-polish`: subdomain
admin redirects (Task 4 / C4) — typing `<slug>.app.seldonframe.com/dashboard`
now 302s to the correct switch-workspace URL instead of 404'ing. So
operators who guess the URL get there; this item is about making it
discoverable without guessing.

---

## P2-4 — Workspace name cosmetics for slug-style inputs

**Surface:** workspace home page heading.

**Issue:** when an operator passes a slug-style name to `create_workspace`
(e.g. `name: "my-workspace"`), the heading on the workspace home page reads
exactly "my-workspace" because that's the literal value the user typed.
The current code correctly threads `org.name` through to the rendered
heading — there is no slug-vs-name confusion in the data layer; the issue
is purely that users sometimes pass technical-looking strings.

**Status:** the MCP welcome message in v1.0.2 (`claude/pre-launch-polish`)
explicitly guides users to provide a friendly business name (e.g.,
"DFW Comfort HVAC", not "dfw-comfort-hvac") via the prompt template + the
6-question interactive flow. Most users following the guidance will type a
real business name and never see the slug-style heading.

**Why kept here as P2:** for users who somehow still pass a slug-style
name AND don't customize the page after, the heading remains slug-style.
A defensive fallback could detect this (heuristic: name === slug AND no
spaces AND contains a hyphen) and prompt the user to provide a friendlier
display name. Low-priority polish.

---

## P2-5 — `__drizzle_migrations` reconciliation in production

**Surface:** infrastructure / DB layer.

**Issue:** the production DB's `__drizzle_migrations` table is empty
(verified during the 2026-04-27 production migration). Future
`drizzle-kit migrate` invocations would either no-op (treating prod as
"up to date" since the journal claims so) OR try to re-apply everything.

**Why deferred:** requires either backfilling the journal with all
applied migrations, OR migrating to a runner that doesn't depend on the
journal. Cross-cuts with P2-6 (journal sync) and P2-7 (Vercel deploy
migrations).

**Suggested fix:** write a one-time reconciliation script that records
each applied migration in `__drizzle_migrations` based on file presence +
schema introspection. Then add a deploy-time check that asserts journal
entry count matches applied count.

---

## P2-6 — `drizzle/meta/_journal.json` out of sync with on-disk SQL files

**Surface:** repo / migration tooling.

**Issue:** 35 SQL files exist in `packages/crm/drizzle/`; only 13 are
registered in `_journal.json`. Migrations 0008-0013 + 0019-0027 are
hand-authored without journal entries (the 0022 file's own header comment
acknowledges this pattern).

**Why deferred:** the journal-out-of-sync state is a known pattern in the
codebase. Fixing requires either backfilling 22 missing entries (and
matching `meta/00XX_*.json` snapshots) or migrating off drizzle-kit's
journal-based runner.

**Suggested fix:** Phase 1 — backfill journal entries by hand for the
hand-authored migrations. Phase 2 — adopt a simpler runner (e.g.,
postgres-migrations) that reads SQL files in numerical order without
needing a journal.

---

## P2-7 — Vercel deploys don't run migrations

**Surface:** CI / deployment pipeline.

**Issue:** the production DB drift surfaced during the 2026-04-27
cleanroom test was caused by Vercel's build pipeline never running
`pnpm db:migrate`. Migrations are authored on dev branches, applied to
the dev DB locally, and never propagated to prod until someone runs the
migrate script manually.

**Why deferred:** depends on P2-5 + P2-6 being resolved first (or
migrating off drizzle-kit). With the journal out of sync, automating
`drizzle-kit migrate` in the build would cause incorrect behavior.

**Suggested fix:** once P2-5 + P2-6 are done, add a `vercel-build`
script step that runs `pnpm db:migrate` against `DATABASE_URL_MIGRATIONS`
(a separate env var so Vercel functions don't try to migrate per-request,
just at deploy time).

---

## P2-8 — `.gitignore` doesn't cover `.env.prod`

**Surface:** repo hygiene.

**Issue:** `vercel env pull --environment=production` writes a
`.env.prod` file containing production secrets. The current `.gitignore`
covers `.vercel` and `.env*.local` but NOT plain `.env.prod`. A future
operator could accidentally `git add .` and commit production secrets.

**Why deferred:** trivial one-liner but doesn't block launch.

**Suggested fix:** add to `.gitignore`:
```
.env.prod
.env.production
.env.staging
```

---

## P2-9 — Update `openclaw/skills/seldonframe/` skill docs to new pricing

**Surface:** internal Claude Code skill instructions.

**Issue:** `openclaw/skills/seldonframe/SKILL.md` and `README.md` still
reference the old `$9 / $29` pricing in the workspace-quota messaging that
Claude shows operators. The user-facing surfaces (landing, /pricing,
billing flow) were updated in `claude/pre-launch-polish`; the internal
skill instructions were left as a follow-up.

**Why deferred:** these strings only affect Claude's behavior when an
operator hits the workspace quota — secondary path. Not visible until the
quota is reached.

**Suggested fix:** find/replace `$9/month`, `$9/mo`, `$29/month`,
`$29/mo` references in `openclaw/skills/seldonframe/*.md` with the new
"Starter $49 / Operator $99 / Agency $149" framing. Match the language
used in `lib/billing/orgs.ts` `WORKSPACE_UPGRADE_REQUIRED_MESSAGE`.

---

## P2-10 — `seldon-cli` (the `seldon init` / `seldon scaffold` commands)

**Surface:** marketing copy mentions `seldon init` and `seldon scaffold`,
but no such CLI exists in the repo. These commands appear in:
- README.md Quick start
- `/docs/quickstart` page Steps 2-4

**Why deferred:** the README and quickstart commands are aspirational —
the actual workflow today is to drive everything through Claude Code via
the MCP. Either the CLI gets built post-launch OR the marketing copy is
trimmed to MCP-only commands.

**Suggested fix:** EITHER (A) implement a thin `seldon` CLI that proxies
to the MCP server's tools (so `seldon init "Name"` ≡
`create_workspace({ name: "Name" })`), OR (B) update marketing copy to
reflect the Claude-Code-only flow and remove the standalone `seldon`
references.

Decision needed before either path proceeds.

---

*Generated as part of `claude/pre-launch-polish` 2026-04-27. Prune items
once they're shipped or superseded.*
