CREATE TABLE "soul_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"source_url" text,
	"raw_content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soul_wiki" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_compiled_at" timestamp with time zone,
	"compilation_version" text DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seldon_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_type" text NOT NULL,
	"block_type" text NOT NULL,
	"block_subtype" text,
	"structure" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "soul_sources" ADD CONSTRAINT "soul_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soul_wiki" ADD CONSTRAINT "soul_wiki_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_soul_sources_org" ON "soul_sources" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_soul_wiki_org_slug_unique" ON "soul_wiki" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "idx_soul_wiki_org" ON "soul_wiki" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_soul_wiki_org_slug" ON "soul_wiki" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "idx_soul_wiki_org_category" ON "soul_wiki" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX "idx_seldon_patterns_framework_block" ON "seldon_patterns" USING btree ("framework_type","block_type");--> statement-breakpoint
CREATE INDEX "idx_seldon_patterns_confidence" ON "seldon_patterns" USING btree ("confidence");