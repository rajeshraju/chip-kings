import type { CalculationResult, Person, Report, Transaction } from "./types";

export const POT_NAME = "POT";

export const isPot = (name: string) => (name || "").toUpperCase() === POT_NAME;

export function roundToDollar(amount: number): number {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return 0;
  return Math.round(amount);
}

export function formatDollar(amount: number): string {
  return roundToDollar(amount).toLocaleString("en-US");
}

export function netForPerson(p: Person): number {
  const earnings = Number(p.earnings) || 0;
  const expenses = Number(p.expenses) || 0;
  return isPot(p.name) ? earnings - expenses : earnings + expenses;
}

export function calculatePayments(people: Person[]): CalculationResult | null {
  if (people.length < 2) return null;

  const nets = people.map((p) => ({ name: p.name, net: netForPerson(p) }));
  const totalNet = nets.reduce((s, p) => s + p.net, 0);
  const avg = totalNet / people.length;

  const diffs = nets.map((p) => ({ name: p.name, difference: p.net - avg }));
  const creditors = diffs
    .filter((d) => d.difference > 0.01)
    .sort((a, b) => b.difference - a.difference);
  const debtors = diffs
    .filter((d) => d.difference < -0.01)
    .sort((a, b) => a.difference - b.difference);

  const transactions: Transaction[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.difference, Math.abs(d.difference));
    const rounded = roundToDollar(amount);
    if (rounded > 0) transactions.push({ from: d.name, to: c.name, amount: rounded });
    c.difference -= amount;
    d.difference += amount;
    if (Math.abs(c.difference) < 0.01) ci++;
    if (Math.abs(d.difference) < 0.01) di++;
  }

  const pot = people.find((p) => isPot(p.name));
  const potExpenses = pot ? Number(pot.expenses) || 0 : 0;
  const potEarnings = pot ? Number(pot.earnings) || 0 : 0;
  const potBalance = potEarnings - potExpenses;

  return {
    totalNet,
    transactions,
    potBalance,
    potExpenses,
    potEarnings,
    hasPot: !!pot,
    playerCount: people.filter((p) => !isPot(p.name)).length,
    people: JSON.parse(JSON.stringify(people)),
  };
}

export function sumPlayerExpenses(people: Person[]): number {
  return people.reduce((sum, p) => (isPot(p.name) ? sum : sum + (Number(p.expenses) || 0)), 0);
}

export type PlayerYtdRow = {
  name: string;
  net: number;
  earnings: number;
  expenses: number;
  gamesPlayed: number;
};

export type YtdSummary = {
  year: number;
  gameCount: number;
  playerCount: number;
  totalEarnings: number;
  totalExpenses: number;
  totalPot: number;
  potBalance: number;
  players: PlayerYtdRow[];
};

export function summarizeYtd(reports: Report[], year: number = new Date().getFullYear()): YtdSummary {
  const inYear = reports.filter((r) => {
    const d = new Date(r.createdAt);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === year;
  });

  const byName = new Map<string, PlayerYtdRow>();
  let potEarnings = 0;
  let potExpenses = 0;

  for (const r of inYear) {
    for (const p of r.snapshot.people) {
      if (isPot(p.name)) {
        potEarnings += Number(p.earnings) || 0;
        potExpenses += Number(p.expenses) || 0;
        continue;
      }
      const key = p.name.trim();
      const row = byName.get(key) ?? {
        name: key,
        net: 0,
        earnings: 0,
        expenses: 0,
        gamesPlayed: 0,
      };
      const earnings = Number(p.earnings) || 0;
      const expenses = Number(p.expenses) || 0;
      row.earnings += earnings;
      row.expenses += expenses;
      row.net += earnings;
      row.gamesPlayed += 1;
      byName.set(key, row);
    }
  }

  const players = Array.from(byName.values()).sort((a, b) => b.net - a.net);
  const totalEarnings = players.reduce((s, p) => s + p.earnings, 0);
  const playerExpenses = players.reduce((s, p) => s + p.expenses, 0);
  const totalExpenses = playerExpenses + potExpenses;

  return {
    year,
    gameCount: inYear.length,
    playerCount: players.length,
    totalEarnings,
    totalExpenses,
    totalPot: potEarnings,
    potBalance: potEarnings - potExpenses,
    players,
  };
}
