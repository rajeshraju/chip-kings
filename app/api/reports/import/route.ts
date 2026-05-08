import { NextResponse } from "next/server";
import { AuthError, requireCanWrite } from "@/lib/auth";
import { listReports, saveReport } from "@/lib/storage";
import type { Person, Report, Transaction } from "@/lib/types";

export const runtime = "nodejs";

function newId(): string {
  return `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isPersonArray(value: unknown): value is Person[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        p &&
        typeof p === "object" &&
        typeof (p as Person).name === "string" &&
        Number.isFinite(Number((p as Person).earnings)) &&
        Number.isFinite(Number((p as Person).expenses))
    )
  );
}

function isTransactionArray(value: unknown): value is Transaction[] {
  return (
    Array.isArray(value) &&
    value.every(
      (t) =>
        t &&
        typeof t === "object" &&
        typeof (t as Transaction).from === "string" &&
        typeof (t as Transaction).to === "string" &&
        Number.isFinite(Number((t as Transaction).amount))
    )
  );
}

function validateReport(raw: unknown): Report | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Report>;
  if (typeof r.title !== "string" || !r.title.trim()) return null;
  if (!r.snapshot || typeof r.snapshot !== "object") return null;
  const s = r.snapshot;
  if (!isPersonArray(s.people)) return null;
  if (!isTransactionArray(s.transactions)) return null;
  return {
    id: typeof r.id === "string" && r.id.trim() ? r.id : newId(),
    title: r.title.trim(),
    createdAt:
      typeof r.createdAt === "string" && r.createdAt
        ? r.createdAt
        : new Date().toISOString(),
    gameDate:
      typeof r.gameDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.gameDate)
        ? r.gameDate
        : undefined,
    createdBy:
      typeof r.createdBy === "string" && r.createdBy ? r.createdBy : "import",
    snapshot: {
      totalNet: Number(s.totalNet) || 0,
      transactions: s.transactions,
      potBalance: Number(s.potBalance) || 0,
      potExpenses: Number(s.potExpenses) || 0,
      potEarnings: Number(s.potEarnings) || 0,
      hasPot: Boolean(s.hasPot),
      playerCount:
        Number(s.playerCount) ||
        s.people.filter((p) => (p.name || "").toUpperCase() !== "POT").length,
      people: s.people,
    },
  };
}

export async function POST(req: Request) {
  try {
    await requireCanWrite();
    const body = (await req.json().catch(() => null)) as
      | { reports?: unknown }
      | unknown[]
      | null;

    const rawReports: unknown[] = Array.isArray(body)
      ? body
      : Array.isArray((body as { reports?: unknown })?.reports)
      ? ((body as { reports: unknown[] }).reports)
      : [];

    if (rawReports.length === 0) {
      return NextResponse.json(
        { error: "No games found in the JSON file" },
        { status: 400 }
      );
    }

    const existing = await listReports({ includeArchived: true });
    const existingIds = new Set(existing.map((r) => r.id));

    const added: Report[] = [];
    const invalid: number[] = [];
    for (let i = 0; i < rawReports.length; i++) {
      const validated = validateReport(rawReports[i]);
      if (!validated) {
        invalid.push(i);
        continue;
      }
      // Re-id on collision so re-imports don't silently overwrite or skip.
      let entry = validated;
      while (existingIds.has(entry.id)) {
        entry = { ...entry, id: newId() };
      }
      existingIds.add(entry.id);
      const saved = await saveReport(entry);
      added.push(saved);
    }

    return NextResponse.json({
      added: added.length,
      invalid: invalid.length,
      reports: added,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
