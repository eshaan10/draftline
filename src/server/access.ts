import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { documents } from "./schema";

export type AccessLevel = "owner" | "editor" | "commenter" | "viewer";

export interface DocAccessResult {
  level: AccessLevel | null;
  document: typeof documents.$inferSelect | null;
}

export async function getDocAccess(
  userId: string | null | undefined,
  docId: string,
): Promise<DocAccessResult> {
  const db = await getDb();
  const rows = await db.select().from(documents).where(eq(documents.id, docId)).limit(1);
  const doc = rows[0];
  if (!doc) return { level: null, document: null };
  if (!userId) return { level: null, document: doc };
  if (doc.ownerId === userId) return { level: "owner", document: doc };

  // B2 will extend here: active document_shares row for userId or user's email -> its role.
  // B5 will extend here: teacher owning the assignment linked to doc -> "commenter".

  return { level: null, document: doc };
}

export function canWrite(level: AccessLevel | null): boolean {
  return level === "owner" || level === "editor";
}

export function canComment(level: AccessLevel | null): boolean {
  return level === "owner" || level === "editor" || level === "commenter";
}

export function canRead(level: AccessLevel | null): boolean {
  return level !== null;
}
