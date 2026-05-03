import { NextResponse } from "next/server";
import { AuthError, requireCanWrite } from "@/lib/auth";
import {
  deleteReconciliation,
  getReconciliation,
} from "@/lib/reconciliations";
import { getReport, saveReport } from "@/lib/storage";
import { adjustPotEntry } from "@/lib/pot";
import { calculatePayments, combinePeople, isPot } from "@/lib/calc";
import type { Transaction } from "@/lib/types";

// Mirror of route.ts potDeltasFromTxns. Kept duplicated so the undo handler
// stays self-contained.
function potDeltasFromTxns(txns: Transaction[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (isPot(t.from)) {
      map.set(t.to, (map.get(t.to) ?? 0) - t.amount);
    } else if (isPot(t.to)) {
      map.set(t.from, (map.get(t.from) ?? 0) + t.amount);
    }
  }
  return map;
}

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireCanWrite();
    const recon = await getReconciliation(params.id);
    if (!recon) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (recon.completed) {
      return NextResponse.json(
        { error: "Reconciliation is completed and cannot be undone" },
        { status: 400 }
      );
    }

    const sources = recon.sourceReports ?? [];
    if (sources.length === 0) {
      return NextResponse.json(
        {
          error:
            "Cannot undo: this reconciliation has no source games stored (created before per-game tracking).",
        },
        { status: 400 }
      );
    }

    // Restore source games. Skip any that already exist (idempotent).
    const restored: string[] = [];
    for (const src of sources) {
      const existing = await getReport(src.id);
      if (existing) continue;
      await saveReport(src);
      restored.push(src.id);
    }

    // Reverse pot ledger adjustments applied during the original reconcile.
    for (const p of recon.snapshot.people) {
      if (isPot(p.name)) continue;
      const delta = -(Number(p.earnings) || 0);
      if (Math.abs(delta) < 0.01) continue;
      try {
        await adjustPotEntry(p.name, delta);
      } catch (e) {
        console.error(`[reconcile.undo] pot reverse failed for ${p.name}:`, e);
      }
    }

    // If settlements were edited, the PATCH handler applied (delta_new −
    // delta_original) to pot ledgers for POT-involved transactions. Reverse
    // that residual here by recomputing the original transactions from
    // sourceReports and subtracting them from the current snapshot's deltas.
    const originalSnapshot = calculatePayments(combinePeople(sources));
    const originalDeltas = originalSnapshot
      ? potDeltasFromTxns(originalSnapshot.transactions)
      : new Map<string, number>();
    const currentDeltas = potDeltasFromTxns(recon.snapshot.transactions);
    const editedNames = new Set<string>([
      ...originalDeltas.keys(),
      ...currentDeltas.keys(),
    ]);
    for (const name of editedNames) {
      const residual =
        (currentDeltas.get(name) ?? 0) - (originalDeltas.get(name) ?? 0);
      if (Math.abs(residual) < 0.01) continue;
      try {
        await adjustPotEntry(name, -residual);
      } catch (e) {
        console.error(
          `[reconcile.undo] pot edit reverse failed for ${name}:`,
          e
        );
      }
    }

    // Remove the reconciliation record. Its payments[] (paid/unpaid status
    // for each settlement) is part of the record and is dropped with it, so
    // no payments survive the undo.
    await deleteReconciliation(params.id);

    return NextResponse.json({
      ok: true,
      restoredReportIds: restored,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
