import { NextResponse } from "next/server";
import { AuthError, requireCanWrite, requireSession } from "@/lib/auth";
import {
  getReconciliation,
  replaceReconciliation,
} from "@/lib/reconciliations";
import { isPot, netForPerson, roundToDollar } from "@/lib/calc";
import { adjustPotEntry } from "@/lib/pot";
import type { Person, Transaction } from "@/lib/types";

// Reverse legacy reconciliations that already applied every player's snapshot
// W/L to the pot ledger under the previous all-paid workflow.
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

function potPaymentDelta(t: Transaction): { name: string; delta: number } | null {
  const fromPot = isPot(t.from);
  const toPot = isPot(t.to);
  if (fromPot === toPot) return null;
  const amount = roundToDollar(Number(t.amount) || 0);
  if (!(amount > 0)) return null;
  return fromPot
    ? { name: t.to, delta: amount }
    : { name: t.from, delta: -amount };
}

async function applyPotPaymentDelta(t: Transaction, sign: 1 | -1) {
  const item = potPaymentDelta(t);
  if (!item) return;
  try {
    await adjustPotEntry(item.name, sign * item.delta);
  } catch (e) {
    console.error(
      `[reconcile.payment] pot payment adjust failed for ${item.name}:`,
      e
    );
  }
}

async function syncPotPaymentDeltas({
  previousTransactions,
  previousApplied,
  nextTransactions,
  nextPayments,
}: {
  previousTransactions: Transaction[];
  previousApplied: boolean[];
  nextTransactions: Transaction[];
  nextPayments: boolean[];
}): Promise<boolean[]> {
  for (let i = 0; i < previousTransactions.length; i++) {
    if (previousApplied[i]) {
      await applyPotPaymentDelta(previousTransactions[i], -1);
    }
  }

  const nextApplied = nextTransactions.map((t, i) => {
    return Boolean(nextPayments[i]) && potPaymentDelta(t) !== null;
  });
  for (let i = 0; i < nextTransactions.length; i++) {
    if (nextApplied[i]) {
      await applyPotPaymentDelta(nextTransactions[i], 1);
    }
  }
  return nextApplied;
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
          { error: "Cannot complete: all payments must be settled first" },
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

      // The editor may also pass payments[] alongside transactions[] so the
      // user can toggle paid/unpaid in the same save. Paid rows involving POT
      // are applied directly to that player's pot ledger and tracked so edits
      // can reverse/reapply them safely.
      const prevTxns = existing.snapshot.transactions;
      const prevPayments = existing.payments ?? [];

      let nextPayments: boolean[];
      if (Array.isArray(body.payments)) {
        const rawPayments = body.payments as unknown[];
        nextPayments = nextTxns.map((_, i) => Boolean(rawPayments[i]));
      } else {
        nextPayments = nextTxns.map((_, i) => Boolean(prevPayments[i]));
      }

      let nextPotApplied = Boolean(existing.potApplied);
      if (nextPotApplied) {
        await applySnapshotPotDeltas(existing.snapshot.people, -1);
        nextPotApplied = false;
      }
      const nextPotPaymentApplied = await syncPotPaymentDeltas({
        previousTransactions: prevTxns,
        previousApplied: existing.potPaymentApplied ?? [],
        nextTransactions: nextTxns,
        nextPayments,
      });

      const updated = {
        ...existing,
        snapshot: {
          ...existing.snapshot,
          transactions: nextTxns,
        },
        payments: nextPayments,
        potApplied: nextPotApplied,
        potPaymentApplied: nextPotPaymentApplied,
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
    const newPayments = txns.map((_, i) => Boolean(rawPayments[i]));

    let nextPotApplied = Boolean(existingForPayments.potApplied);
    if (nextPotApplied) {
      await applySnapshotPotDeltas(
        existingForPayments.snapshot.people,
        -1
      );
      nextPotApplied = false;
    }
    const nextPotPaymentApplied = await syncPotPaymentDeltas({
      previousTransactions: txns,
      previousApplied: existingForPayments.potPaymentApplied ?? [],
      nextTransactions: txns,
      nextPayments: newPayments,
    });

    const updated = await replaceReconciliation(params.id, {
      ...existingForPayments,
      payments: newPayments,
      potApplied: nextPotApplied,
      potPaymentApplied: nextPotPaymentApplied,
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
