import { NextResponse } from "next/server";
import { AuthError, requireCanWrite, requireSession } from "@/lib/auth";
import {
  getReconciliation,
  replaceReconciliation,
  updateReconciliationPayments,
} from "@/lib/reconciliations";
import { isPot, roundToDollar } from "@/lib/calc";
import { adjustPotEntry } from "@/lib/pot";
import type { Transaction } from "@/lib/types";

// Pot ledger semantics: amount > 0 means POT owes the player. So when POT
// pays X (transaction POT→X), X's ledger entry decreases by the amount; when
// X pays POT (X→POT), X's entry increases. Non-POT transactions don't touch
// the pot ledger.
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

    // transactions update: edit who-pays-whom amounts; settle constraint applies.
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

      // Whole-reconciliation total check: the sum of new settlements must
      // match the original total being settled. Players can be redistributed,
      // but the aggregate amount moved through the reconciliation cannot drift.
      const originalTotal = existing.snapshot.transactions.reduce(
        (s, t) => s + Number(t.amount || 0),
        0
      );
      const newTotal = nextTxns.reduce((s, t) => s + t.amount, 0);
      if (Math.abs(newTotal - originalTotal) >= 1) {
        return NextResponse.json(
          {
            error: `Reconciliation total must equal $${Math.round(
              originalTotal
            )} (current: $${Math.round(newTotal)})`,
          },
          { status: 400 }
        );
      }

      const updated = {
        ...existing,
        snapshot: {
          ...existing.snapshot,
          transactions: nextTxns,
        },
        // Reset payment status — settlements changed.
        payments: nextTxns.map(() => false),
      };
      const saved = await replaceReconciliation(params.id, updated);
      if (!saved) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // Apply the diff between old and new POT-involved settlements to the
      // per-player pot ledger so balances reflect the edited cash flow.
      const oldDeltas = potDeltasFromTxns(existing.snapshot.transactions);
      const newDeltas = potDeltasFromTxns(nextTxns);
      const names = new Set<string>([
        ...oldDeltas.keys(),
        ...newDeltas.keys(),
      ]);
      for (const name of names) {
        const net = (newDeltas.get(name) ?? 0) - (oldDeltas.get(name) ?? 0);
        if (Math.abs(net) >= 0.01) {
          try {
            await adjustPotEntry(name, net);
          } catch (e) {
            console.error(`[reconcile.edit] pot adjust failed for ${name}:`, e);
          }
        }
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
    const payments = body.payments.map((v) => Boolean(v));
    const updated = await updateReconciliationPayments(params.id, payments);
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
