import { getSession } from "@/lib/auth";
import { Calculator } from "@/components/Calculator";
import { listPlayers, seedIfEmpty } from "@/lib/players";
import { getReport } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  const session = await getSession();
  await seedIfEmpty();
  const players = await listPlayers();
  const editingReport = searchParams.edit
    ? await getReport(searchParams.edit)
    : null;
  return (
    <Calculator
      role={session?.role ?? null}
      playerNames={players.map((p) => p.name)}
      editingReport={editingReport}
    />
  );
}
