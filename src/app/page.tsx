import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";

export default async function HomePage() {
  const user = await getSessionUser();
  redirect(user ? "/docs" : "/login");
}
