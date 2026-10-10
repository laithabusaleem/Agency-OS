import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/authz";

export const instant = false;

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
