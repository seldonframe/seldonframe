ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS subscription jsonb NOT NULL DEFAULT '{}'::jsonb;
