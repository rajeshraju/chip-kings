import { getSession } from "@/lib/auth";
import { Calculator } from "@/components/Calculator";
import { listPlayers, seedIfEmpty } from "@/lib/players";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  await seedIfEmpty();
  const players = await listPlayers();
  return (
    <Calculator
      role={session?.role ?? null}
      playerNames={players.map((p) => p.name)}
    />
  );
}
