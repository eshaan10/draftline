import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { assignments, documents, documentShares } from "./schema";

export type AccessLevel = "owner" | "editor" | "commenter" | "viewer";

export interface DocAccessResult {
  level: AccessLevel | null;
  document: typeof documents.$inferSelect | null;
}

// Single source of truth for document access, per PLAN.md "Access rules":
// 1. Owner of the document -> owner.
// 2. Active share row for the user (by user_id) -> its role.
// 3. Teacher who owns the assignment linked to the document -> commenter. (B5)
// 4. Otherwise null.
//
// Pending invites grant nothing until activatePendingForUser (in auth.ts)
// promotes them on signup or login.
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

  // Rule 2: active share row for this user.
  const share = await db
    .select({ role: documentShares.role })
    .from(documentShares)
    .where(
      and(
        eq(documentShares.documentId, docId),
        eq(documentShares.userId, userId),
        eq(documentShares.status, "active"),
      ),
    )
    .limit(1);
  if (share.length > 0) {
    return { level: share[0].role, document: doc };
  }

  // Rule 3: teacher of the assignment linked to this document gets commenter
  // access (view and comment only, never edit).
  if (doc.assignmentId) {
    const assignment = await db
      .select({ teacherId: assignments.teacherId })
      .from(assignments)
      .where(eq(assignments.id, doc.assignmentId))
      .limit(1);
    if (assignment[0]?.teacherId === userId) {
      return { level: "commenter", document: doc };
    }
  }

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

export function canManageSharing(level: AccessLevel | null): boolean {
  return level === "owner";
}
