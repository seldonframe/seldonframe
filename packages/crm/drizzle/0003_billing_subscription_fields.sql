ALTER TABLE "users" ADD COLUMN "plan_id" text;
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;
ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" text;
ALTER TABLE "users" ADD COLUMN "billing_period" text DEFAULT 'monthly' NOT NULL;
ALTER TABLE "users" ADD COLUMN "subscription_status" text DEFAULT 'trialing' NOT NULL;
ALTER TABLE "users" ADD COLUMN "trial_ends_at" timestamp with time zone;

ALTER TABLE "organizations" ADD COLUMN "owner_id" text DEFAULT '' NOT NULL;
ALTER TABLE "organizations" ADD COLUMN "parent_user_id" text;
