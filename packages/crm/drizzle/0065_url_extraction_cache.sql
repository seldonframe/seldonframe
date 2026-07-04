-- 0065 — URL-keyed extraction result cache (web activation P1).
-- Repeat pastes of the same URL skip scrape + LLM entirely (~$0).
-- kind discriminates the payload shape: 'business_facts' (run-create-from-url
-- pipeline) vs 'analyze_url' (public analyze-url endpoint).
CREATE TABLE IF NOT EXISTS "url_extraction_cache" (
  "url_hash" text NOT NULL,
  "kind" text NOT NULL,
  "url" text NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "url_extraction_cache_pk" PRIMARY KEY ("url_hash", "kind")
);
