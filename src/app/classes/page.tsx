import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { classes } from "@/server/schema";
import { ClassesPage } from "@/features/classes/ClassesPage";

export const dynamic = "force-dynamic";

export default async function ClassesRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/docs");

  const db = await getDb();
  const rows = await db
    .select()
    .from(classes)
    .where(eq(classes.teacherId, user.id))
    .orderBy(desc(classes.createdAt));

  return (
    <ClassesPage
      user={{ id: user.id, name: user.name }}
      classes={rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt.toISOString() }))}
    />
  );
}
