import { NextResponse } from "next/server";
import { AuthError, requireCanWrite } from "@/lib/auth";
import {
  deleteReconciliation,
  getReconciliation,
  listReconciliations,
} from "@/lib/reconciliations";
import {
  getReport,
  saveReport,
  syncReportArchiveFlags,
  unarchiveReport,
} from "@/lib/storage";
import { adjustPotEntry } from "@/lib/pot";
import { isPot, netForPerson, roundToDollar } from "@/lib/calc";

export const runtime = "nodejs";

function potPaymentDelta(from: string, to: string, amount: number) {
  const fromPot = isPot(from);
  const toPot = isPot(to);
  if (fromPot === toPot) return null;
  const rounded = roundToDollar(amount);
  if (!(rounded > 0)) return null;
  return fromPot
    ? { name: to, delta: rounded }
    : { name: from, delta: -rounded };
}

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

    // Bring source games back to the active list. Modern reconciliations
    // archive their sources, so unarchive in place. For legacy reconciliations
    // (or sources that were hard-deleted) the report is missing from storage
    // entirely, so fall back to re-saving the snapshot from sourceReports[].
    const restored: string[] = [];
    for (const src of sources) {
      const existing = await getReport(src.id);
      if (!existing) {
        await saveReport({ ...src, archived: false, archivedAt: undefined });
        restored.push(src.id);
        continue;
      }
      if (existing.archived) {
        await unarchiveReport(src.id);
        restored.push(src.id);
      }
    }

    // Reverse legacy snapshot W/L deltas if this reconciliation applied them
    // under the previous all-paid workflow.
    if (recon.potApplied) {
      for (const p of recon.snapshot.people) {
        if (isPot(p.name)) continue;
        const delta = netForPerson(p);
        if (Math.abs(delta) < 0.01) continue;
        try {
          await adjustPotEntry(p.name, -delta);
        } catch (e) {
          console.error(
            `[reconcile.undo] pot reverse failed for ${p.name}:`,
            e
          );
        }
      }
    }

    // Reverse any row-level POT payments that were applied while payment
    // checkboxes were toggled.
    const potPaymentApplied = recon.potPaymentApplied ?? [];
    for (let i = 0; i < recon.snapshot.transactions.length; i++) {
      if (!potPaymentApplied[i]) continue;
      const t = recon.snapshot.transactions[i];
      const item = potPaymentDelta(t.from, t.to, t.amount);
      if (!item) continue;
      try {
        await adjustPotEntry(item.name, -item.delta);
      } catch (e) {
        console.error(
          `[reconcile.undo] pot payment reverse failed for ${item.name}:`,
          e
        );
      }
    }

    // Remove the reconciliation record. Its payments[] is part of the record
    // and is dropped with it, so no payment state survives the undo.
    await deleteReconciliation(params.id);

    // Make the games from the undone reconciliation active again. If any game
    // is still referenced by another reconciliation, keep it archived.
    const remainingReconciliations = await listReconciliations();
    const stillReconciledIds = new Set<string>();
    for (const item of remainingReconciliations) {
      for (const id of item.reportIds) stillReconciledIds.add(id);
      for (const src of item.sourceReports ?? []) stillReconciledIds.add(src.id);
    }
    await syncReportArchiveFlags(stillReconciledIds);

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
