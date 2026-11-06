import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

type Schema = typeof schema;
export type Db = NeonHttpDatabase<Schema> | PgliteDatabase<Schema>;

let neonDb: NeonHttpDatabase<Schema> | null = null;
let pgliteDb: PgliteDatabase<Schema> | null = null;
let pgliteInit: Promise<PgliteDatabase<Schema>> | null = null;

async function initPglite(): Promise<PgliteDatabase<Schema>> {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  const dir = path.join(process.cwd(), "drizzle");
  if (!fs.existsSync(dir)) {
    throw new Error(
      "drizzle/ migrations not found. Run `npm run db:generate` before running tests.",
    );
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await client.exec(stmt);
    }
  }
  pgliteDb = db;
  return db;
}

export async function getDb(): Promise<Db> {
  if (process.env.NODE_ENV === "test") {
    if (pgliteDb) return pgliteDb;
    if (!pgliteInit) pgliteInit = initPglite();
    return pgliteInit;
  }
  if (!neonDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const client = neon(url);
    neonDb = drizzleNeon(client, { schema });
  }
  return neonDb;
}

export async function resetTestDb() {
  pgliteDb = null;
  pgliteInit = null;
}
