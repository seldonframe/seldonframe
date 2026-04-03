ALTER TABLE organizations ADD COLUMN IF NOT EXISTS parent_user_id UUID;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS soul_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS soul_content_generated integer DEFAULT 0 NOT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enabled_blocks text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integrations jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period text DEFAULT 'monthly' NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trialing' NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at timestamp with time zone;

ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS source text DEFAULT 'template' NOT NULL;
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS content_html text;
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS content_css text;
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS editor_data jsonb DEFAULT 'null'::jsonb;
