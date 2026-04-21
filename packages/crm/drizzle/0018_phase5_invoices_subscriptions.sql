CREATE TABLE "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "contact_id" uuid,
  "provider" text DEFAULT 'stripe' NOT NULL,
  "stripe_invoice_id" text,
  "stripe_account_id" text,
  "stripe_customer_id" text,
  "number" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "subtotal" numeric(12,2) DEFAULT '0' NOT NULL,
  "tax" numeric(12,2) DEFAULT '0' NOT NULL,
  "total" numeric(12,2) DEFAULT '0' NOT NULL,
  "amount_paid" numeric(12,2) DEFAULT '0' NOT NULL,
  "amount_due" numeric(12,2) DEFAULT '0' NOT NULL,
  "due_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "voided_at" timestamp with time zone,
  "hosted_invoice_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "invoices_org_created_idx" ON "invoices" USING btree ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "invoices_org_contact_idx" ON "invoices" USING btree ("org_id", "contact_id");
--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("org_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_stripe_invoice_uidx" ON "invoices" USING btree ("stripe_invoice_id");
--> statement-breakpoint

CREATE TABLE "invoice_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "invoice_id" uuid NOT NULL,
  "description" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "unit_amount" numeric(12,2) DEFAULT '0' NOT NULL,
  "amount" numeric(12,2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");
--> statement-breakpoint

CREATE TABLE "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "contact_id" uuid,
  "provider" text DEFAULT 'stripe' NOT NULL,
  "stripe_subscription_id" text,
  "stripe_account_id" text,
  "stripe_customer_id" text,
  "stripe_price_id" text,
  "product_name" text,
  "status" text DEFAULT 'active' NOT NULL,
  "amount" numeric(12,2) DEFAULT '0' NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "interval" text DEFAULT 'month' NOT NULL,
  "interval_count" text DEFAULT '1' NOT NULL,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "trial_end" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "subscriptions_org_created_idx" ON "subscriptions" USING btree ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "subscriptions_org_contact_idx" ON "subscriptions" USING btree ("org_id", "contact_id");
--> statement-breakpoint
CREATE INDEX "subscriptions_org_status_idx" ON "subscriptions" USING btree ("org_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_sub_uidx" ON "subscriptions" USING btree ("stripe_subscription_id");
--> statement-breakpoint

CREATE TABLE "payment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "provider" text DEFAULT 'stripe' NOT NULL,
  "provider_account_id" text,
  "provider_event_id" text,
  "event_type" text NOT NULL,
  "target_type" text DEFAULT 'payment' NOT NULL,
  "target_id" uuid,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "payment_events_org_target_idx" ON "payment_events" USING btree ("org_id", "target_type", "target_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "payment_events_org_type_idx" ON "payment_events" USING btree ("org_id", "event_type", "created_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_uidx" ON "payment_events" USING btree ("provider", "provider_event_id");
--> statement-breakpoint

-- Extend payment_records for Connect routing + refunds/disputes.
ALTER TABLE "payment_records" ADD COLUMN "stripe_account_id" text;
--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "stripe_charge_id" text;
--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "refunded_amount" numeric(12,2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "refunded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "disputed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "payment_records" ADD COLUMN "stripe_dispute_id" text;
