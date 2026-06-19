-- ============================================================================
-- SeldonFrame pricing reset migration  (reset-except-Seldon-Studio)
--
-- WHEN TO RUN: at GO-LIVE only — after the new billing is tested and the env
-- points at the LIVE Stripe products. NOT before. Run by Claude-main / Max,
-- never by a subagent.
--
-- WHAT IT DOES:
--   * Seldon Studio (Max's own agency)  -> comped Agency plan (no Stripe charge)
--   * Every other org                    -> reset to no active paid plan
--                                            (clears stale legacy Stripe state)
--   * All users' legacy billing columns  -> cleared (webhook no longer writes them;
--                                            no real third-party Stripe subs exist)
--
-- Seldon Studio's demo child workspaces are NOT special-cased: they reset like
-- everything else and inherit Agency entitlements via the agency-chain resolver
-- (organizations.parent_agency_id). Because Seldon Studio is comped (no
-- stripeSubscriptionId), the per-workspace overage sync no-ops for it, so its
-- demo children are never billed.
--
-- Seldon Studio org id:  e1b16f47-d90a-4f3f-adb5-484b639ff0ed
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — PREVIEW (read-only; run these first and eyeball the output)
-- ----------------------------------------------------------------------------

-- 1a. Seldon Studio today (should become comped Agency)
SELECT id, name, slug,
       plan,
       subscription->>'tier'   AS tier,
       subscription->>'status' AS status,
       subscription->>'stripeSubscriptionId' AS stripe_sub
FROM organizations
WHERE id = 'e1b16f47-d90a-4f3f-adb5-484b639ff0ed';

-- 1b. Seldon Studio's child workspaces (informational — they reset + inherit)
SELECT id, name, slug, parent_agency_id
FROM organizations
WHERE parent_agency_id IS NOT NULL
  AND parent_agency_id IN (
    SELECT id FROM partner_agencies
    WHERE owner_user_id = (SELECT owner_id FROM organizations
                           WHERE id = 'e1b16f47-d90a-4f3f-adb5-484b639ff0ed')
       OR owner_workspace_id = 'e1b16f47-d90a-4f3f-adb5-484b639ff0ed'
  )
ORDER BY created_at;

-- 1c. Every OTHER org that currently carries any billing state (these get reset)
SELECT id, name, slug,
       plan,
       subscription->>'tier'   AS tier,
       subscription->>'stripeCustomerId'     AS stripe_cust,
       subscription->>'stripeSubscriptionId' AS stripe_sub
FROM organizations
WHERE id <> 'e1b16f47-d90a-4f3f-adb5-484b639ff0ed'
  AND ( subscription <> '{}'::jsonb OR plan <> 'free' )
ORDER BY created_at;

-- 1d. Headline counts
SELECT
  (SELECT count(*) FROM organizations) AS total_orgs,
  (SELECT count(*) FROM organizations
     WHERE id <> 'e1b16f47-d90a-4f3f-adb5-484b639ff0ed') AS orgs_to_reset,
  (SELECT count(*) FROM users
     WHERE plan_id IS NOT NULL
        OR stripe_customer_id IS NOT NULL
        OR stripe_subscription_id IS NOT NULL) AS users_with_billing_state;


-- ----------------------------------------------------------------------------
-- STEP 2 — APPLY (run only after reviewing STEP 1). Transactional.
-- ----------------------------------------------------------------------------
BEGIN;

-- 2a. Seldon Studio -> comped Agency (no Stripe ids => sync engine skips it)
UPDATE organizations
SET plan = 'agency',
    subscription = jsonb_build_object(
      'tier',               'agency',
      'status',             'active',
      'comped',             true,
      'includedWorkspaces', 10
    )
WHERE id = 'e1b16f47-d90a-4f3f-adb5-484b639ff0ed';

-- 2b. Every other org -> reset to no active paid plan (tier resolves to "inactive")
UPDATE organizations
SET plan = 'free',
    subscription = '{}'::jsonb
WHERE id <> 'e1b16f47-d90a-4f3f-adb5-484b639ff0ed';

-- 2c. Clear all users' legacy billing columns (the webhook no longer writes these;
--     organizations.subscription is the single source of truth now).
UPDATE users
SET plan_id               = NULL,
    stripe_customer_id     = NULL,
    stripe_subscription_id = NULL,
    subscription_status    = 'inactive';

-- 2d. Verify before committing
SELECT id, plan, subscription->>'tier' AS tier, subscription->>'status' AS status
FROM organizations
WHERE id = 'e1b16f47-d90a-4f3f-adb5-484b639ff0ed';   -- expect agency / active

SELECT count(*) AS orgs_still_with_billing
FROM organizations
WHERE id <> 'e1b16f47-d90a-4f3f-adb5-484b639ff0ed'
  AND subscription <> '{}'::jsonb;                    -- expect 0

-- COMMIT;   -- <- uncomment to apply once the two checks above look right
-- ROLLBACK; -- <- use this instead to abort
