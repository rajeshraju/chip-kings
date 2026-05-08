import { NextResponse } from "next/server";
import { AuthError, requireCanWrite, requireSession } from "@/lib/auth";
import {
  getReconciliation,
  replaceReconciliation,
} from "@/lib/reconciliations";
import { isPot, netForPerson, roundToDollar } from "@/lib/calc";
import { adjustPotEntry } from "@/lib/pot";
import type { Person, Transaction } from "@/lib/types";

function isAllPaid(transactions: Transaction[], payments: boolean[]): boolean {
  if (transactions.length === 0) return false;
  return transactions.every((_, i) => Boolean(payments[i]));
}

// Apply each non-POT player's snapshot W/L to their pot ledger. Called when a
// reconciliation transitions to "all settlements paid" — at that point each
// player's pot balance changes by exactly their net for the reconciliation,
// regardless of how the cash actually moved between players in settlements.
// Any deviation between settlement totals and snapshot W/L is implicitly
// absorbed by the pot ledger (POT covers the difference).
async function applySnapshotPotDeltas(people: Person[], sign: 1 | -1) {
  for (const p of people) {
    if (isPot(p.name)) continue;
    const delta = sign * netForPerson(p);
    if (Math.abs(delta) < 0.01) continue;
    try {
      await adjustPotEntry(p.name, delta);
    } catch (e) {
      console.error(
        `[reconcile.payment] pot adjust failed for ${p.name}:`,
        e
      );
    }
  }
}

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const item = await getReconciliation(params.id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ reconciliation: item });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireCanWrite();
    const body = (await req.json().catch(() => ({}))) as {
      payments?: unknown;
      transactions?: unknown;
      completed?: unknown;
    };

    // Mark as complete: lock the reconciliation. Allowed only when every
    // settlement is already paid.
    if (body.completed === true) {
      const existing = await getReconciliation(params.id);
      if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (existing.completed) {
        return NextResponse.json({ reconciliation: existing });
      }
      const txns = existing.snapshot.transactions;
      if (txns.length === 0) {
        return NextResponse.json(
          { error: "Nothing to complete — no settlements" },
          { status: 400 }
        );
      }
      const allPaid = txns.every((_, i) => Boolean(existing.payments?.[i]));
      if (!allPaid) {
        return NextResponse.json(
          { error: "Cannot complete: some settlements are still outstanding" },
          { status: 400 }
        );
      }
      const updated = {
        ...existing,
        completed: true,
        completedAt: new Date().toISOString(),
        completedBy: session.username,
      };
      const saved = await replaceReconciliation(params.id, updated);
      if (!saved) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ reconciliation: saved });
    }

    // transactions update: edit who-pays-whom amounts.
    if (Array.isArray(body.transactions)) {
      const existing = await getReconciliation(params.id);
      if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (existing.completed) {
        return NextResponse.json(
          { error: "Reconciliation is completed and cannot be edited" },
          { status: 400 }
        );
      }

      const playerNames = new Set(
        existing.snapshot.people.map((p) => p.name.trim())
      );

      const nextTxns: Transaction[] = [];
      for (const raw of body.transactions) {
        const t = raw as Partial<Transaction>;
        const from = String(t.from ?? "").trim();
        const to = String(t.to ?? "").trim();
        const amount = roundToDollar(Number(t.amount));
        if (!from || !to) {
          return NextResponse.json(
            { error: "Each settlement must have a from and to player" },
            { status: 400 }
          );
        }
        if (from === to) {
          return NextResponse.json(
            { error: `A settlement cannot go from "${from}" to themselves` },
            { status: 400 }
          );
        }
        if (!playerNames.has(from) || !playerNames.has(to)) {
          return NextResponse.json(
            { error: `Unknown player in settlement: "${!playerNames.has(from) ? from : to}"` },
            { status: 400 }
          );
        }
        if (!(amount > 0)) {
          return NextResponse.json(
            { error: "Settlement amounts must be greater than zero" },
            { status: 400 }
          );
        }
        nextTxns.push({ from, to, amount });
      }

      // Editing settlements does NOT touch the pot ledger by itself. The
      // editor may also pass payments[] alongside transactions[] so the user
      // can toggle paid/unpaid in the same save. POT only updates when the
      // recon transitions to/from "all settlements paid": at that moment
      // each non-POT player's snapshot W/L is applied (or reversed) on
      // their pot ledger entry.
      const prevTxns = existing.snapshot.transactions;
      const prevPayments = existing.payments ?? [];

      let nextPayments: boolean[];
      if (Array.isArray(body.payments)) {
        const rawPayments = body.payments as unknown[];
        nextPayments = nextTxns.map((_, i) => Boolean(rawPayments[i]));
      } else {
        nextPayments = nextTxns.map((_, i) => Boolean(prevPayments[i]));
      }

      const wasAllPaid =
        Boolean(existing.potApplied) && isAllPaid(prevTxns, prevPayments);
      const willBeAllPaid = isAllPaid(nextTxns, nextPayments);
      let nextPotApplied = Boolean(existing.potApplied);
      if (wasAllPaid && !willBeAllPaid) {
        await applySnapshotPotDeltas(existing.snapshot.people, -1);
        nextPotApplied = false;
      } else if (!wasAllPaid && willBeAllPaid) {
        await applySnapshotPotDeltas(existing.snapshot.people, 1);
        nextPotApplied = true;
      }

      const updated = {
        ...existing,
        snapshot: {
          ...existing.snapshot,
          transactions: nextTxns,
        },
        payments: nextPayments,
        potApplied: nextPotApplied,
      };
      const saved = await replaceReconciliation(params.id, updated);
      if (!saved) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({ reconciliation: saved });
    }

    if (!Array.isArray(body.payments)) {
      return NextResponse.json(
        { error: "Provide payments[], transactions[], or completed:true" },
        { status: 400 }
      );
    }
    // Block payment toggles on completed reconciliations.
    const existingForPayments = await getReconciliation(params.id);
    if (!existingForPayments) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existingForPayments.completed) {
      return NextResponse.json(
        { error: "Reconciliation is completed and is now read-only" },
        { status: 400 }
      );
    }

    const rawPayments = body.payments as unknown[];
    const txns = existingForPayments.snapshot.transactions;
    const oldPayments = existingForPayments.payments ?? [];
    const newPayments = txns.map((_, i) => Boolean(rawPayments[i]));

    const wasAllPaid =
      Boolean(existingForPayments.potApplied) &&
      isAllPaid(txns, oldPayments);
    const willBeAllPaid = isAllPaid(txns, newPayments);
    let nextPotApplied = Boolean(existingForPayments.potApplied);
    if (wasAllPaid && !willBeAllPaid) {
      await applySnapshotPotDeltas(
        existingForPayments.snapshot.people,
        -1
      );
      nextPotApplied = false;
    } else if (!wasAllPaid && willBeAllPaid) {
      await applySnapshotPotDeltas(existingForPayments.snapshot.people, 1);
      nextPotApplied = true;
    }

    const updated = await replaceReconciliation(params.id, {
      ...existingForPayments,
      payments: newPayments,
      potApplied: nextPotApplied,
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ reconciliation: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
