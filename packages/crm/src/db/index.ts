import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://user:pass@localhost:5432/seldon_frame?sslmode=require";

const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema, casing: "snake_case" });

export type DbClient = typeof db;
