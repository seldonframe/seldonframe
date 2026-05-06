-- v1.19.0 — contacts (org_id, lower(email)) uniqueness + defensive backfill.
--
-- Bug class: portal-access-code lookup is `eq(contacts.org_id, org_id) AND
-- lower(contacts.email) = email_normalized`. Without this index, two
-- contact rows with the same lowercased email can co-exist within an
-- org. .limit(1) returns whichever row Postgres serves first, which
-- might be the one with portal_access_enabled=false → magic-link
-- request silently drops.
--
-- Reproduced 2026-05-06: dresslikeag@gmail.com had two rows in the
-- same org_id (one from booking flow with portal_access_enabled=true,
-- one from a manual stopgap insert with the flag false). Lookup
-- returned the manual one → silent_no_op.
--
-- v1.19 fix:
--   1. Defensive backfill: any existing dups are merged into a single
--      "winner" row (preferring portal_access_enabled=true; tie-break
--      by oldest created_at). FK references on the loser rows are
--      repointed to the winner across all 14 contact-referencing
--      tables before the loser is deleted.
--   2. Unique partial index on (org_id, lower(email)) WHERE email IS
--      NOT NULL. Multiple "no email" contacts remain valid (a contact
--      can have no email and still be a real person we track via
--      phone or in-person notes).
--
-- Idempotency: the backfill block is written so re-running this
-- migration is a no-op when no dups exist. We confirmed prod has 0
-- dups before queuing this migration; the backfill is defense-in-
-- depth in case dups sneak in between dev and deploy.

BEGIN;

-- ─── 1. defensive backfill ────────────────────────────────────────────────

-- Build the dedup picks in a temp table. Group by (org_id, lower(email))
-- and pick the winner using a deterministic ranking:
--   tier 1: portal_access_enabled = true (we want the row that's
--            already been opted in by the operator)
--   tier 2: oldest created_at (longest history of activity)
--   tier 3: smallest id (uuid lex order, just for total ordering)
CREATE TEMP TABLE IF NOT EXISTS _v19_contact_dedup_picks AS
WITH dup_groups AS (
  SELECT
    org_id,
    lower(email) AS lower_email,
    array_agg(id ORDER BY portal_access_enabled DESC, created_at ASC, id ASC) AS ids_ranked
  FROM contacts
  WHERE email IS NOT NULL AND email <> ''
  GROUP BY org_id, lower(email)
  HAVING count(*) > 1
)
SELECT
  org_id,
  lower_email,
  ids_ranked[1] AS winner_id,
  ids_ranked[2:array_length(ids_ranked, 1)] AS loser_ids
FROM dup_groups;

-- Surface the dedup plan in the migration log (psql will print it).
DO $$
DECLARE
  v_pairs int;
BEGIN
  SELECT count(*) INTO v_pairs FROM _v19_contact_dedup_picks;
  IF v_pairs > 0 THEN
    RAISE NOTICE 'v1.19 contacts dedup: % duplicate group(s) detected, repointing FKs and deleting losers', v_pairs;
  ELSE
    RAISE NOTICE 'v1.19 contacts dedup: no duplicate groups detected, skipping repoint+delete';
  END IF;
END$$;

-- Repoint FKs from loser_ids → winner_id across all 14 tables that
-- reference contacts.id. Each UPDATE is idempotent; running on a
-- dup-free DB does nothing.
DO $$
DECLARE
  pick RECORD;
  loser uuid;
BEGIN
  FOR pick IN SELECT * FROM _v19_contact_dedup_picks LOOP
    FOREACH loser IN ARRAY pick.loser_ids LOOP
      -- order: alphabetical by table name to keep this scan-friendly.
      UPDATE activities         SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE bookings           SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE conversations      SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE deals              SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE emails             SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE intake_forms       SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE invoices           SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE payments           SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE portal_access_codes SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE portal_documents   SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE portal_messages    SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE portal_resources   SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE sms_messages       SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE subscriptions      SET contact_id = pick.winner_id WHERE contact_id = loser;
      UPDATE workspace_records  SET contact_id = pick.winner_id WHERE contact_id = loser;
    END LOOP;
  END LOOP;
END$$;

-- Delete the loser contact rows. After the FK repoint step, no
-- referencing rows remain pointing to losers, so cascade-delete is a
-- non-issue. (Even if a stray ref was missed, ON DELETE SET NULL /
-- CASCADE on the dependent tables makes this safe.)
DO $$
DECLARE
  pick RECORD;
BEGIN
  FOR pick IN SELECT * FROM _v19_contact_dedup_picks LOOP
    DELETE FROM contacts
     WHERE id = ANY(pick.loser_ids);
  END LOOP;
END$$;

DROP TABLE IF EXISTS _v19_contact_dedup_picks;

-- ─── 2. unique partial index ──────────────────────────────────────────────

-- Partial: NULL/empty email rows are exempt (a contact can legitimately
-- exist without an email; uniqueness only matters for routable identities).
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_lower_email_uniq
  ON contacts (org_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';

COMMIT;
