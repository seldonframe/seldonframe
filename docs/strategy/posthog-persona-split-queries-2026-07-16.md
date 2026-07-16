# PostHog persona-split query pack — 2026-07-16

**Purpose:** settle the open bet behind the agency homepage flip (PR #100, 2026-07-15): does homepage
traffic/conversion actually skew agency-operator, or SMB-owner? Kill threshold set at flip time:
signups −20% over 14 days with no compensating rise in builds→claims ⇒ revert (one commit).

**Why now:** since PR #106 (2026-07-16), EVERY free-start CTA funnels through one entry —
the hero chatbox (`/#hero-form`) — so the funnel below is clean for the first time.

**Project:** 497925 (events proxied via `/ingest`). Instrumentation available today: `$pageview`,
`$autocapture`, `share_card_viewed`, `activation_step_completed` (server), MCP/LLM analytics events.
No hero-submit custom event exists yet (see "recommended event" at the bottom) — the funnel uses
destination pageviews as the submit proxy, which is accurate because the chatbox always navigates:
URL tab → `/try?url=…` · describe tab → `/signup?intent=build` → `/clients/new`.

> Run these in PostHog → SQL (HogQL). Adjust the host filter if www/app hosts are split in your data.
> Or authorize the PostHog connector in claude.ai connector settings and Claude can run + chart them.

---

## Query A — Persona mix of homepage visitors (no new instrumentation)

Classifies each person who viewed `/` in the window by the OTHER intent pages they touched:
agency-intent (`/agencies`, `/compare/*`, `/sell`, agency guides) vs smb-intent (calculators,
`/best/*`, charts). People touching neither = "unclassified" (expect a big bucket; the split of
the classified tail is the signal).

```sql
WITH person_paths AS (
  SELECT person_id,
         groupArray(DISTINCT properties.$pathname) AS paths
  FROM events
  WHERE event = '$pageview'
    AND timestamp > now() - INTERVAL 14 DAY
  GROUP BY person_id
)
SELECT
  multiIf(
    arrayExists(p -> p LIKE '/agencies%' OR p LIKE '/compare/%' OR p LIKE '/sell%'
                  OR p LIKE '/guides/%agency%' OR p LIKE '/guides/white-label%', paths), 'agency-intent',
    arrayExists(p -> p LIKE '/tools/%calculator%' OR p LIKE '/best/%' OR p LIKE '/charts/%', paths), 'smb-intent',
    'unclassified') AS persona,
  count() AS visitors
FROM person_paths
WHERE arrayExists(p -> p = '/', paths)
GROUP BY persona ORDER BY visitors DESC
```

**Read it as:** if agency-intent ≫ smb-intent among classified homepage visitors, the hero bet is
confirmed on traffic. (Conversion is Query B.)

## Query B — THE funnel: homepage → chatbox → build → claim/signup (persona-split)

Create as a **Funnel insight** (UI) — steps:
1. `$pageview` where pathname = `/`
2. `$pageview` where pathname = `/try` **OR** (pathname = `/signup` AND `$current_url` contains `intent=build`)  ← chatbox submit proxy
3. `$pageview` where pathname starts with `/claim` **OR** pathname starts with `/clients/new`
4. `activation_step_completed` (any)

Conversion window 14 days; breakdown by the persona cohorts from Query A (save A's two branches as
Cohorts first: "agency-intent visitors" / "smb-intent visitors"). The persona whose funnel converts
deeper is the persona the homepage should keep speaking to.

## Query C — Kill-threshold monitor (the −20% tripwire)

Weekly trend, compare the 14 days BEFORE 2026-07-15 (pre-#100) against after:

```sql
SELECT toStartOfWeek(timestamp) AS wk,
  countIf(event='$pageview' AND properties.$pathname='/signup')                            AS signup_views,
  countIf(event='$pageview' AND properties.$pathname='/try')                               AS anon_builds_started,
  countIf(event='$pageview' AND properties.$pathname='/signup'
          AND properties.$current_url LIKE '%intent=build%')                               AS describe_builds,
  countIf(event='$pageview' AND properties.$pathname LIKE '/claim%')                       AS claims
FROM events
WHERE timestamp > now() - INTERVAL 6 WEEK
GROUP BY wk ORDER BY wk
```

**Tripwire:** signup_views down >20% vs pre-flip weeks AND (anon_builds_started + describe_builds +
claims) NOT up ⇒ revert the hero persona (one commit, PR #100's H1). Otherwise the flip stands.

## Query D — Which CTA labels actually feed the chatbox (post-#106)

```sql
SELECT properties.$pathname AS page,
       coalesce(properties.$el_text, extract(properties.elements_chain, 'text="([^"]*)"')) AS cta_label,
       count() AS clicks
FROM events
WHERE event = '$autocapture'
  AND timestamp > now() - INTERVAL 14 DAY
  AND properties.elements_chain LIKE '%#hero-form%'
GROUP BY page, cta_label
ORDER BY clicks DESC LIMIT 30
```

Tells you which button ("Start for free" nav vs "Build it free" hero vs pricing-grid CTA…) and which
page actually sends people into the chatbox — i.e., where copy iterations pay.

---

## Recommended follow-up event (one line, big precision win)

`marketing-hero.tsx` submit handler: `posthog.capture("hero_form_submitted", { tab, hasValue: true })`
— replaces the pageview proxy in Query B step 2 and separates "landed on /try by link" from "typed
and submitted". Not required for the queries above to be directional.

**Refresh discipline:** re-run A+B after 14 days of post-#106 data (from 2026-07-30) before making
any persona call — today's data is mid-transition.
