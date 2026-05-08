"use client";

import { useMemo, useState } from "react";
import { formatDollar } from "@/lib/calc";
import type { Reconciliation, Transaction } from "@/lib/types";
import { exportElementToPdf } from "@/lib/print";
import { toast } from "./Toaster";
import { formatAppShortDate } from "@/lib/dates";

const PRINT_ID = "payments-print-area";

type PaymentRow = {
  recon: Reconciliation;
  txnIndex: number;
  txn: Transaction;
  paid: boolean;
};

type PlayerSummary = {
  name: string;
  owedTotal: number;
  owedPaid: number;
  owedOutstanding: number;
  receiveTotal: number;
  receivePaid: number;
  receiveOutstanding: number;
  outflows: PaymentRow[];
  inflows: PaymentRow[];
};

export function PaymentsView({
  initialReconciliations,
  canWrite,
}: {
  initialReconciliations: Reconciliation[];
  canWrite: boolean;
}) {
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>(
    initialReconciliations
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedRecons, setExpandedRecons] = useState<Set<string>>(
    new Set()
  );
  const [filter, setFilter] = useState<"all" | "outstanding" | "paid">("all");
  const [mode, setMode] = useState<"player" | "reconciliation">("player");

  const summaries = useMemo(
    () => buildPlayerSummaries(reconciliations),
    [reconciliations]
  );

  const totals = useMemo(() => {
    let totalAmount = 0;
    let paidAmount = 0;
    let txnCount = 0;
    let paidCount = 0;
    for (const r of reconciliations) {
      r.snapshot.transactions.forEach((t, i) => {
        totalAmount += t.amount;
        txnCount += 1;
        if (r.payments?.[i]) {
          paidAmount += t.amount;
          paidCount += 1;
        }
      });
    }
    return {
      totalAmount,
      paidAmount,
      outstandingAmount: totalAmount - paidAmount,
      txnCount,
      paidCount,
    };
  }, [reconciliations]);

  function togglePlayer(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleReconExpanded(id: string) {
    setExpandedRecons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function togglePayment(reconId: string, txnIndex: number) {
    const recon = reconciliations.find((r) => r.id === reconId);
    if (!recon) return;

    const prevPayments = recon.payments;
    const nextPayments = recon.snapshot.transactions.map((_, i) =>
      Boolean(recon.payments?.[i])
    );
    nextPayments[txnIndex] = !nextPayments[txnIndex];

    // Optimistic update.
    setReconciliations((prev) =>
      prev.map((r) =>
        r.id === reconId ? { ...r, payments: nextPayments } : r
      )
    );

    try {
      const res = await fetch(`/api/reconciliations/${reconId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments: nextPayments }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { reconciliation?: Reconciliation };
      if (data.reconciliation) {
        setReconciliations((prev) =>
          prev.map((r) => (r.id === reconId ? data.reconciliation! : r))
        );
      }
    } catch {
      setReconciliations((prev) =>
        prev.map((r) =>
          r.id === reconId ? { ...r, payments: prevPayments } : r
        )
      );
      toast("Could not save payment", "error");
    }
  }

  if (reconciliations.length === 0) {
    return (
      <div className="card">
        <div className="card-body text-center py-10 text-fg-dim text-sm">
          <span className="block text-3xl mb-2">📭</span>
          No reconciliations yet. Reconcile some games first to track payments.
        </div>
      </div>
    );
  }

  if (totals.txnCount === 0) {
    return (
      <div className="card">
        <div className="card-body text-center py-10 text-fg-dim text-sm">
          <span className="block text-3xl mb-2">✅</span>
          No payments needed across reconciliations — everyone is even.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" id={PRINT_ID}>
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="font-display text-sm font-semibold text-fg-muted uppercase tracking-wide">
            💳 Payments Summary
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small no-print"
            onClick={() => exportElementToPdf(PRINT_ID, "Payments")}
            title="Export as PDF"
          >
            ⬇ PDF
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="stat">
            <div className="stat-label">Total Owed</div>
            <div className="stat-value">${formatDollar(totals.totalAmount)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Paid</div>
            <div className="stat-value text-success">
              ${formatDollar(totals.paidAmount)}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Outstanding</div>
            <div className="stat-value text-danger">
              ${formatDollar(totals.outstandingAmount)}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Settlements</div>
            <div className="stat-value">
              {totals.paidCount}/{totals.txnCount}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex-wrap gap-3">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            {mode === "player" ? "👥 By Player" : "🧾 By Reconciliation"}
            <span className="text-xs text-fg-dim font-mono">
              (
              {mode === "player"
                ? summaries.length
                : reconciliations.length}
              )
            </span>
          </h2>
          <div className="flex gap-1 flex-wrap">
            <FilterChip
              active={mode === "player"}
              onClick={() => setMode("player")}
            >
              By Player
            </FilterChip>
            <FilterChip
              active={mode === "reconciliation"}
              onClick={() => setMode("reconciliation")}
            >
              By Reconciliation
            </FilterChip>
            <span className="mx-1 w-px bg-border" aria-hidden />
            <FilterChip
              active={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All
            </FilterChip>
            <FilterChip
              active={filter === "outstanding"}
              onClick={() => setFilter("outstanding")}
            >
              Outstanding
            </FilterChip>
            <FilterChip
              active={filter === "paid"}
              onClick={() => setFilter("paid")}
            >
              Paid
            </FilterChip>
          </div>
        </div>
        <div className="card-body">
          {mode === "player" ? (
            summaries.length === 0 ? (
              <div className="text-center py-8 text-fg-dim text-sm">
                No players to display.
              </div>
            ) : (
              <div className="space-y-3">
                {summaries.map((s) => (
                  <PlayerCard
                    key={s.name}
                    summary={s}
                    expanded={expanded.has(s.name)}
                    filter={filter}
                    canWrite={canWrite}
                    onToggleExpand={() => togglePlayer(s.name)}
                    onTogglePayment={togglePayment}
                  />
                ))}
              </div>
            )
          ) : reconciliations.length === 0 ? (
            <div className="text-center py-8 text-fg-dim text-sm">
              No reconciliations to display.
            </div>
          ) : (
            <div className="space-y-3">
              {reconciliations.map((r) => (
                <ReconCard
                  key={r.id}
                  recon={r}
                  expanded={expandedRecons.has(r.id)}
                  filter={filter}
                  canWrite={canWrite}
                  onToggleExpand={() => toggleReconExpanded(r.id)}
                  onTogglePayment={togglePayment}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-colors ${
        active
          ? "bg-bg-card text-fg border-accent"
          : "bg-bg-elevated text-fg-dim border-border hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function PlayerCard({
  summary,
  expanded,
  filter,
  canWrite,
  onToggleExpand,
  onTogglePayment,
}: {
  summary: PlayerSummary;
  expanded: boolean;
  filter: "all" | "outstanding" | "paid";
  canWrite: boolean;
  onToggleExpand: () => void;
  onTogglePayment: (reconId: string, txnIndex: number) => void;
}) {
  const net = summary.receiveTotal - summary.owedTotal;
  const netPaid = summary.receivePaid - summary.owedPaid;
  const netOutstanding = net - netPaid;
  const isPositive = net >= 0;
  const isSettled = Math.abs(netOutstanding) < 0.5;

  return (
    <div
      className={`card !mb-0 ${
        isSettled ? "!bg-bg-subtle border-border-strong" : ""
      }`}
    >
      <div className="card-body pt-4 pb-4">
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-[15px] truncate">
                  {summary.name}
                </span>
                <span className="text-xs text-fg-dim font-mono">
                  {expanded ? "▾" : "▸"}
                </span>
              </div>
              <div className="flex flex-wrap gap-3.5 text-xs text-fg-muted font-mono mt-1.5">
                {summary.owedTotal > 0 && (
                  <span>
                    📤 Owes ${formatDollar(summary.owedOutstanding)}
                    {summary.owedPaid > 0 && (
                      <span className="text-fg-dim">
                        {" "}
                        (paid ${formatDollar(summary.owedPaid)})
                      </span>
                    )}
                  </span>
                )}
                {summary.receiveTotal > 0 && (
                  <span>
                    📥 Receives ${formatDollar(summary.receiveOutstanding)}
                    {summary.receivePaid > 0 && (
                      <span className="text-fg-dim">
                        {" "}
                        (paid ${formatDollar(summary.receivePaid)})
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div
                className={`font-mono font-semibold text-[15px] ${
                  netOutstanding === 0
                    ? "text-fg-dim"
                    : isPositive
                    ? "text-success"
                    : "text-danger"
                }`}
              >
                {netOutstanding === 0
                  ? "Settled"
                  : `${isPositive ? "+" : "−"}$${formatDollar(
                      Math.abs(netOutstanding)
                    )}`}
              </div>
              <div className="text-[10px] text-fg-dim font-mono uppercase tracking-wide mt-0.5">
                net outstanding
              </div>
            </div>
          </div>
        </button>

        {expanded && (
          <div className="mt-4 pt-3 border-t border-border space-y-4">
            {summary.outflows.length > 0 && (
              <PaymentList
                title="Owes (paying out)"
                rows={summary.outflows}
                direction="out"
                filter={filter}
                canWrite={canWrite}
                onTogglePayment={onTogglePayment}
              />
            )}
            {summary.inflows.length > 0 && (
              <PaymentList
                title="Receives (paid in)"
                rows={summary.inflows}
                direction="in"
                filter={filter}
                canWrite={canWrite}
                onTogglePayment={onTogglePayment}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentList({
  title,
  rows,
  direction,
  filter,
  canWrite,
  onTogglePayment,
}: {
  title: string;
  rows: PaymentRow[];
  direction: "in" | "out";
  filter: "all" | "outstanding" | "paid";
  canWrite: boolean;
  onTogglePayment: (reconId: string, txnIndex: number) => void;
}) {
  const filtered = rows.filter((r) => {
    if (filter === "outstanding") return !r.paid;
    if (filter === "paid") return r.paid;
    return true;
  });
  if (filtered.length === 0) return null;

  return (
    <div>
      <div className="font-display text-xs font-semibold text-fg-muted uppercase tracking-wide mb-2">
        {title}
      </div>
      <div className="flex flex-col gap-2">
        {filtered.map((row) => {
          const counterpart = direction === "out" ? row.txn.to : row.txn.from;
          const arrow = direction === "out" ? "→" : "←";
          const isReceive = direction === "in";
          const tint = isReceive
            ? "bg-success/15 border-success/40"
            : "bg-danger/15 border-danger/40";
          const locked = !canWrite || !!row.recon.completed;
          return (
            <label
              key={`${row.recon.id}-${row.txnIndex}`}
              className={`flex items-center justify-between gap-3 p-3 rounded-[10px] border text-sm text-fg transition-opacity ${tint} ${
                row.paid ? "opacity-60" : ""
              } ${!locked ? "cursor-pointer" : ""}`}
              title={
                row.recon.completed
                  ? "This reconciliation is completed (read-only)"
                  : undefined
              }
            >
              <div className="flex items-center gap-3 flex-wrap min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={row.paid}
                  disabled={locked}
                  onChange={() => onTogglePayment(row.recon.id, row.txnIndex)}
                  className="w-4 h-4 accent-accent flex-shrink-0 disabled:cursor-not-allowed"
                  aria-label={`Mark payment as ${row.paid ? "unpaid" : "paid"}`}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={`flex items-center gap-2 ${
                      row.paid ? "line-through" : ""
                    }`}
                  >
                    <span className="text-fg text-xs font-semibold">{arrow}</span>
                    <strong className="font-semibold truncate text-fg">
                      {counterpart}
                    </strong>
                  </div>
                  <div className="text-[11px] text-fg font-mono mt-0.5 truncate opacity-80">
                    {row.recon.title}
                  </div>
                </div>
              </div>
              <span
                className={`font-mono font-semibold text-[15px] flex-shrink-0 text-fg ${
                  row.paid ? "line-through" : ""
                }`}
              >
                ${formatDollar(row.txn.amount)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ReconCard({
  recon,
  expanded,
  filter,
  canWrite,
  onToggleExpand,
  onTogglePayment,
}: {
  recon: Reconciliation;
  expanded: boolean;
  filter: "all" | "outstanding" | "paid";
  canWrite: boolean;
  onToggleExpand: () => void;
  onTogglePayment: (reconId: string, txnIndex: number) => void;
}) {
  const txns = recon.snapshot.transactions;
  const totalAmount = txns.reduce((s, t) => s + t.amount, 0);
  const paidAmount = txns.reduce(
    (s, t, i) => (recon.payments?.[i] ? s + t.amount : s),
    0
  );
  const outstandingAmount = totalAmount - paidAmount;
  const paidCount = txns.reduce(
    (s, _t, i) => s + (recon.payments?.[i] ? 1 : 0),
    0
  );
  const isSettled = txns.length > 0 && paidCount === txns.length;

  const filteredIndexes = txns
    .map((_t, i) => i)
    .filter((i) => {
      const paid = !!recon.payments?.[i];
      if (filter === "outstanding") return !paid;
      if (filter === "paid") return paid;
      return true;
    });

  return (
    <div
      className={`card !mb-0 ${
        isSettled ? "!bg-bg-subtle border-border-strong" : ""
      }`}
    >
      <div className="card-body pt-4 pb-4">
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-semibold text-[15px] truncate">
                  {recon.title}
                </span>
                {recon.completed && (
                  <span className="text-[10px] uppercase tracking-wider font-mono text-success border border-success/40 rounded-md px-1.5 py-0.5">
                    Completed
                  </span>
                )}
                <span className="text-xs text-fg-dim font-mono">
                  {expanded ? "▾" : "▸"}
                </span>
              </div>
              <div className="text-[11px] text-fg-dim font-mono mt-0.5">
                {formatAppShortDate(recon.createdAt)}
                {" · "}
                {txns.length} settlement{txns.length === 1 ? "" : "s"}
              </div>
              <div className="flex flex-wrap gap-3.5 text-xs text-fg-muted font-mono mt-1.5">
                <span>
                  💵 ${formatDollar(totalAmount)} total
                </span>
                {paidAmount > 0 && (
                  <span className="text-success">
                    ✓ ${formatDollar(paidAmount)} paid
                  </span>
                )}
                {outstandingAmount > 0 && (
                  <span className="text-danger">
                    ⏳ ${formatDollar(outstandingAmount)} outstanding
                  </span>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div
                className={`font-mono font-semibold text-[15px] ${
                  isSettled ? "text-fg-dim" : "text-accent"
                }`}
              >
                {isSettled ? "Settled" : `${paidCount}/${txns.length}`}
              </div>
              <div className="text-[10px] text-fg-dim font-mono uppercase tracking-wide mt-0.5">
                {isSettled ? "all paid" : "paid"}
              </div>
            </div>
          </div>
        </button>

        {expanded && (
          <div className="mt-4 pt-3 border-t border-border space-y-2">
            {filteredIndexes.length === 0 ? (
              <div className="text-center py-3 text-xs text-fg-dim">
                No settlements match this filter.
              </div>
            ) : (
              filteredIndexes.map((i) => {
                const t = txns[i];
                const paid = !!recon.payments?.[i];
                const locked = !canWrite || !!recon.completed;
                return (
                  <label
                    key={i}
                    className={`flex items-center justify-between gap-3 p-3 rounded-[10px] border text-sm text-fg transition-opacity ${
                      paid
                        ? "bg-success/15 border-success/40 opacity-80"
                        : "bg-bg-elevated border-border"
                    } ${!locked ? "cursor-pointer" : ""}`}
                    title={
                      recon.completed
                        ? "Reconciliation is completed (read-only)"
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-3 flex-wrap min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={paid}
                        disabled={locked}
                        onChange={() => onTogglePayment(recon.id, i)}
                        className="w-4 h-4 accent-accent flex-shrink-0 disabled:cursor-not-allowed"
                        aria-label={`Mark payment from ${t.from} to ${t.to} as ${
                          paid ? "unpaid" : "paid"
                        }`}
                      />
                      <div
                        className={`flex items-center gap-2 flex-wrap min-w-0 ${
                          paid ? "line-through" : ""
                        }`}
                      >
                        <strong className="font-semibold text-fg">{t.from}</strong>
                        <span className="text-fg text-xs font-semibold">→</span>
                        <strong className="font-semibold text-fg">{t.to}</strong>
                      </div>
                    </div>
                    <span
                      className={`font-mono font-semibold text-[15px] flex-shrink-0 text-fg ${
                        paid ? "line-through" : ""
                      }`}
                    >
                      ${formatDollar(t.amount)}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildPlayerSummaries(
  reconciliations: Reconciliation[]
): PlayerSummary[] {
  const map = new Map<string, PlayerSummary>();

  function ensure(name: string): PlayerSummary {
    let entry = map.get(name);
    if (!entry) {
      entry = {
        name,
        owedTotal: 0,
        owedPaid: 0,
        owedOutstanding: 0,
        receiveTotal: 0,
        receivePaid: 0,
        receiveOutstanding: 0,
        outflows: [],
        inflows: [],
      };
      map.set(name, entry);
    }
    return entry;
  }

  for (const recon of reconciliations) {
    recon.snapshot.transactions.forEach((txn, idx) => {
      const paid = Boolean(recon.payments?.[idx]);
      const row: PaymentRow = { recon, txnIndex: idx, txn, paid };

      const fromEntry = ensure(txn.from);
      fromEntry.owedTotal += txn.amount;
      if (paid) fromEntry.owedPaid += txn.amount;
      else fromEntry.owedOutstanding += txn.amount;
      fromEntry.outflows.push(row);

      const toEntry = ensure(txn.to);
      toEntry.receiveTotal += txn.amount;
      if (paid) toEntry.receivePaid += txn.amount;
      else toEntry.receiveOutstanding += txn.amount;
      toEntry.inflows.push(row);
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    const aOut = a.owedOutstanding + a.receiveOutstanding;
    const bOut = b.owedOutstanding + b.receiveOutstanding;
    if (bOut !== aOut) return bOut - aOut;
    return a.name.localeCompare(b.name);
  });
}
