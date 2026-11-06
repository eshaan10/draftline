import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { users, documentShares, classMembers, type User } from "./schema";

const COOKIE_NAME = "draftline_session";
const SEVEN_DAYS = 60 * 60 * 24 * 7;

function getSecret(): Uint8Array {
  const raw =
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === "test" ? "test-only-session-secret-32bytes-xxxxx" : "");
  if (!raw) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(raw);
}

async function signSession(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

async function setSessionCookie(userId: string): Promise<void> {
  const token = await signSession(userId);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SEVEN_DAYS,
    path: "/",
  });
}

export type Role = "teacher" | "student";

export type AuthResult =
  | { user: User }
  | { error: "email_taken" | "invalid_credentials" | "bad_request" };

export async function signup(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
}): Promise<AuthResult> {
  const db = await getDb();
  const email = input.email.toLowerCase().trim();
  if (!email || !input.password || !input.name) return { error: "bad_request" };

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return { error: "email_taken" };

  const passwordHash = await bcrypt.hash(input.password, 10);
  const [user] = await db
    .insert(users)
    .values({ email, name: input.name.trim(), role: input.role, passwordHash })
    .returning();

  await activatePendingForUser(user);
  await setSessionCookie(user.id);
  return { user };
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const db = await getDb();
  const email = input.email.toLowerCase().trim();
  if (!email || !input.password) return { error: "invalid_credentials" };

  const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (found.length === 0) return { error: "invalid_credentials" };
  const user = found[0];

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) return { error: "invalid_credentials" };

  await activatePendingForUser(user);
  await setSessionCookie(user.id);
  return { user };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) return null;
    const db = await getDb();
    const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return found[0] ?? null;
  } catch {
    return null;
  }
}

export async function activatePendingForUser(user: Pick<User, "id" | "email">): Promise<void> {
  const db = await getDb();
  await db
    .update(documentShares)
    .set({ status: "active", userId: user.id })
    .where(and(eq(documentShares.email, user.email), eq(documentShares.status, "pending")));
  await db
    .update(classMembers)
    .set({ status: "active", userId: user.id })
    .where(and(eq(classMembers.email, user.email), eq(classMembers.status, "pending")));
  // After class membership is activated, create student copies for any
  // assignments that already exist in those classes. Lazy-imported to avoid
  // a circular import through db/tx.
  const { materializeCopiesForUser } = await import("./assignmentCopies");
  await materializeCopiesForUser(user);
}
