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
  // Sort non-POT entries before POT so the greedy matching pairs players with
  // each other first. POT only participates after the non-POT pool is
  // exhausted on its side, so a player owing POT and another player owed by
  // POT settle directly via a player → player transaction whenever possible.
  const creditors = diffs
    .filter((d) => d.difference > 0.01)
    .sort((a, b) => {
      const aPot = isPot(a.name);
      const bPot = isPot(b.name);
      if (aPot !== bPot) return aPot ? 1 : -1;
      return b.difference - a.difference;
    });
  const debtors = diffs
    .filter((d) => d.difference < -0.01)
    .sort((a, b) => {
      const aPot = isPot(a.name);
      const bPot = isPot(b.name);
      if (aPot !== bPot) return aPot ? 1 : -1;
      return a.difference - b.difference;
    });

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

export function combinePeople(reports: Report[]): Person[] {
  const map = new Map<string, Person>();
  for (const r of reports) {
    for (const p of r.snapshot.people) {
      const key = p.name.trim().toLowerCase();
      const earn = Number(p.earnings) || 0;
      const exp = Number(p.expenses) || 0;
      const existing = map.get(key);
      if (existing) {
        existing.earnings += earn;
        existing.expenses += exp;
      } else {
        map.set(key, { name: p.name.trim(), earnings: earn, expenses: exp });
      }
    }
  }
  return Array.from(map.values());
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
  totalWinnings: number;
  totalLosses: number;
  totalExpenses: number;
  playerExpenses: number;
  potExpenses: number;
  totalPot: number;
  potBalance: number;
  players: PlayerYtdRow[];
};

export type PeriodKind = "year" | "quarter" | "month";

export type PeriodRange = {
  kind: PeriodKind;
  year: number;
  // 1-12 for month, 1-4 for quarter, ignored for year.
  index?: number;
  // Inclusive start / exclusive end timestamps the range covers.
  start: number;
  end: number;
  label: string;
};

export function buildPeriodRange(
  kind: PeriodKind,
  year: number,
  index?: number
): PeriodRange {
  if (kind === "month") {
    const m = Math.max(1, Math.min(12, index ?? 1));
    const start = new Date(year, m - 1, 1).getTime();
    const end = new Date(year, m, 1).getTime();
    const label = `${new Date(year, m - 1, 1).toLocaleString("en-US", {
      month: "long",
    })} ${year}`;
    return { kind, year, index: m, start, end, label };
  }
  if (kind === "quarter") {
    const q = Math.max(1, Math.min(4, index ?? 1));
    const startMonth = (q - 1) * 3;
    const start = new Date(year, startMonth, 1).getTime();
    const end = new Date(year, startMonth + 3, 1).getTime();
    return { kind, year, index: q, start, end, label: `Q${q} ${year}` };
  }
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  return { kind, year, start, end, label: String(year) };
}

export function summarizeYtd(
  reports: Report[],
  yearOrRange: number | PeriodRange = new Date().getFullYear()
): YtdSummary {
  const range =
    typeof yearOrRange === "number"
      ? buildPeriodRange("year", yearOrRange)
      : yearOrRange;
  const inYear = reports.filter((r) => {
    const d = new Date(r.createdAt);
    if (Number.isNaN(d.getTime())) return false;
    const t = d.getTime();
    return t >= range.start && t < range.end;
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
  const totalWinnings = players.reduce(
    (s, p) => (p.net > 0 ? s + p.net : s),
    0
  );
  const totalLosses = players.reduce(
    (s, p) => (p.net < 0 ? s + -p.net : s),
    0
  );
  const playerExpenses = players.reduce((s, p) => s + p.expenses, 0);
  const totalExpenses = playerExpenses + potExpenses;

  return {
    year: range.year,
    gameCount: inYear.length,
    playerCount: players.length,
    totalEarnings,
    totalWinnings,
    totalLosses,
    totalExpenses,
    playerExpenses,
    potExpenses,
    totalPot: potEarnings,
    potBalance: potEarnings - potExpenses,
    players,
  };
}
