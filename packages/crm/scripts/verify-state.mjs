// Quick post-apply state verifier. Used to confirm what 0012/0013/0014
// actually did before continuing with 0015+.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(".env.prod", "utf8");
const url = env
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="))
  .replace(/^DATABASE_URL=/, "")
  .replace(/^"|"$/g, "");
const sql = neon(url);

const brainCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'brain_events'
    AND column_name IN ('salience_score', 'feedback_score')
`;
console.log("brain_events 0012/0013 columns:", brainCols.map((c) => c.column_name));

const wsCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'workspace_secrets' ORDER BY ordinal_position
`;
console.log("workspace_secrets (0014) columns:", wsCols.map((c) => c.column_name));

const apiCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'api_keys' AND column_name = 'kind'
`;
console.log("api_keys.kind (0015):", apiCols.length > 0 ? "PRESENT" : "MISSING");

const apiIdx = await sql`
  SELECT indexname FROM pg_indexes
  WHERE tablename = 'api_keys' AND indexname = 'api_keys_kind_prefix_idx'
`;
console.log("api_keys_kind_prefix_idx (0015):", apiIdx.length > 0 ? "PRESENT" : "MISSING");
