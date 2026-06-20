CREATE TABLE "agent_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"builder_org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"blueprint" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"eval_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"builder_org_id" uuid NOT NULL,
	"agent_template_id" uuid NOT NULL,
	"client_name" text NOT NULL,
	"client_contact" jsonb,
	"surface" text DEFAULT 'phone' NOT NULL,
	"phone_number" text,
	"calendar_ref" jsonb,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builder_llm_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"builder_org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_builder_org_id_organizations_id_fk" FOREIGN KEY ("builder_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_builder_org_id_organizations_id_fk" FOREIGN KEY ("builder_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_agent_template_id_agent_templates_id_fk" FOREIGN KEY ("agent_template_id") REFERENCES "public"."agent_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_llm_keys" ADD CONSTRAINT "builder_llm_keys_builder_org_id_organizations_id_fk" FOREIGN KEY ("builder_org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_templates_builder_org_idx" ON "agent_templates" USING btree ("builder_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_templates_builder_slug_uniq" ON "agent_templates" USING btree ("builder_org_id",lower("slug"));--> statement-breakpoint
CREATE INDEX "deployments_builder_status_idx" ON "deployments" USING btree ("builder_org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_phone_number_uniq" ON "deployments" USING btree ("phone_number") WHERE "deployments"."phone_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "builder_llm_keys_org_provider_uniq" ON "builder_llm_keys" USING btree ("builder_org_id","provider");