import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listUsers, toPublic } from "@/lib/users";
import { listPlayers, seedIfEmpty } from "@/lib/players";
import { getSettings } from "@/lib/settings";
import { listPotLedger } from "@/lib/pot";
import { AdminTabs } from "@/components/AdminTabs";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/");

  await seedIfEmpty();
  const [users, players, settings, potEntries] = await Promise.all([
    listUsers().then((u) => u.map(toPublic)),
    listPlayers(),
    getSettings(),
    listPotLedger(),
  ]);

  return (
    <AdminTabs
      initialUsers={users}
      currentUserId={session.userId}
      initialPlayers={players}
      initialSettings={settings}
      initialPotEntries={potEntries}
    />
  );
}
