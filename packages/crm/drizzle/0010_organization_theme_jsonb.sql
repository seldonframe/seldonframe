ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "theme" jsonb NOT NULL DEFAULT '{"primaryColor":"#14b8a6","accentColor":"#0d9488","fontFamily":"Inter","mode":"dark","borderRadius":"rounded","logoUrl":null}'::jsonb;
