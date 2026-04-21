import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listUsers, toPublic } from "@/lib/users";
import { UsersManager } from "@/components/UsersManager";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "admin") redirect("/");

  const users = (await listUsers()).map(toPublic);
  return <UsersManager initialUsers={users} currentUserId={session.userId} />;
}
