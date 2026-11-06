import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { getDb } from "../src/server/db";
import { users } from "../src/server/schema";

const DEMO_USERS = [
  { email: "rivera@demo.test", name: "Ms. Rivera", role: "teacher" as const },
  { email: "ana@demo.test", name: "Ana", role: "student" as const },
  { email: "ben@demo.test", name: "Ben", role: "student" as const },
  { email: "cam@demo.test", name: "Cam", role: "student" as const },
  { email: "dee@demo.test", name: "Dee", role: "student" as const },
];

async function main() {
  const db = await getDb();
  const passwordHash = await bcrypt.hash("demo1234", 10);
  for (const u of DEMO_USERS) {
    await db
      .insert(users)
      .values({ ...u, passwordHash })
      .onConflictDoNothing({ target: users.email });
  }
  console.log(`Seeded ${DEMO_USERS.length} demo users (password: demo1234).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
