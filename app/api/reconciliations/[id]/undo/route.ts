import { NextResponse } from "next/server";
import { AuthError, requireCanWrite } from "@/lib/auth";
import {
  deleteReconciliation,
  getReconciliation,
} from "@/lib/reconciliations";
import { getReport, saveReport, unarchiveReport } from "@/lib/storage";
import { adjustPotEntry } from "@/lib/pot";
import { isPot, netForPerson } from "@/lib/calc";

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

    // Reverse the snapshot W/L deltas if they were applied (i.e., the recon
    // had reached "all settlements paid" state). Modern reconciliations
    // apply W/L to the pot ledger as a single transition rather than per
    // settlement, so undoing only needs to reverse those once.
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

    // Remove the reconciliation record. Its payments[] is part of the record
    // and is dropped with it, so no payment state survives the undo.
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
