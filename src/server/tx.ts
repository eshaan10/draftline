// Atomic transaction helper. Uses the pglite driver's transaction in tests,
// and the Neon serverless Pool (websockets) in dev/prod since neon-http does
// not support interactive transactions.
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { getDb } from "./db";

type Schema = typeof schema;

// Transaction callback gets a drizzle-like interface. The exact type differs
// between the Pool and PGlite drivers at the type level, but both support the
// same insert/select/update API we use here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = any;

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV === "test") {
    const db = await getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (db as any).transaction(fn);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });
  const db = drizzlePool(pool, { schema });
  try {
    return await db.transaction(fn);
  } finally {
    await pool.end();
  }
}
