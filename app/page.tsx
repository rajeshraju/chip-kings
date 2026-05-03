import { getSession } from "@/lib/auth";
import { Calculator } from "@/components/Calculator";
import { listPlayers, seedIfEmpty } from "@/lib/players";
import { getReport } from "@/lib/storage";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  const session = await getSession();
  await seedIfEmpty();
  const [players, settings] = await Promise.all([
    listPlayers(),
    getSettings(),
  ]);
  const editingReport = searchParams.edit
    ? await getReport(searchParams.edit)
    : null;
  return (
    <Calculator
      role={session?.role ?? null}
      playerNames={players.map((p) => p.name)}
      editingReport={editingReport}
      defaultChipsTaken={settings.initialChipsTaken}
      chipsIncrement={settings.chipsIncrement}
    />
  );
}
