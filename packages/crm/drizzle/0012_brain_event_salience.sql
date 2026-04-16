ALTER TABLE "brain_events"
ADD COLUMN IF NOT EXISTS "salience_score" numeric(4, 3) NOT NULL DEFAULT 0.5;
