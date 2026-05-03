"use client";

import { useEffect, useState } from "react";
import { formatDollar } from "@/lib/calc";
import type { CalculationResult } from "@/lib/types";

const STORAGE_PREFIX = "ck:paid:";

export function ResultsView({
  result,
  reportId,
  payments,
  onPaymentsChange,
  paymentsDisabled,
}: {
  result: CalculationResult;
  reportId?: string;
  // Controlled mode: when payments + onPaymentsChange are provided, the parent
  // is the source of truth (used for server-persisted reconciliation payments).
  payments?: boolean[];
  onPaymentsChange?: (next: boolean[]) => void;
  paymentsDisabled?: boolean;
}) {
  const isBalanced = Math.abs(result.totalNet) < 0.01;
  const controlled = Array.isArray(payments) && typeof onPaymentsChange === "function";
  const storageKey = !controlled && reportId ? `${STORAGE_PREFIX}${reportId}` : null;

  const [paidLocal, setPaidLocal] = useState<boolean[]>(() =>
    result.transactions.map(() => false)
  );

  useEffect(() => {
    if (controlled) return;
    if (!storageKey) {
      setPaidLocal(result.transactions.map(() => false));
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as boolean[];
        setPaidLocal(
          result.transactions.map((_, i) => Boolean(saved[i]))
        );
        return;
      }
    } catch {}
    setPaidLocal(result.transactions.map(() => false));
  }, [storageKey, result.transactions, controlled]);

  const paid = controlled
    ? result.transactions.map((_, i) => Boolean(payments![i]))
    : paidLocal;

  function toggle(i: number) {
    if (paymentsDisabled) return;
    if (controlled) {
      const next = result.transactions.map((_, idx) => Boolean(payments![idx]));
      next[i] = !next[i];
      onPaymentsChange!(next);
      return;
    }
    setPaidLocal((prev) => {
      const next = prev.slice();
      next[i] = !next[i];
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  }

  const paidCount = paid.filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="font-display text-sm font-semibold text-fg-muted uppercase tracking-wide mb-4">
          📊 Game Summary
        </div>
        {isBalanced ? (
          <div className="alert alert-success">✓ All balanced</div>
        ) : (
          <div className="alert alert-warning">
            ⚠ Differential: {result.totalNet >= 0 ? "+" : "−"}$
            {formatDollar(Math.abs(result.totalNet))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="stat">
            <div className="stat-label">Players</div>
            <div className="stat-value">{result.playerCount}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Expenses</div>
            <div className="stat-value">${formatDollar(result.potExpenses)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Settlements</div>
            <div className="stat-value">{result.transactions.length}</div>
          </div>
          {result.hasPot && (
            <div className="stat">
              <div className="stat-label">POT Balance</div>
              <div
                className={`stat-value ${
                  result.potBalance >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {result.potBalance >= 0 ? "+" : "−"}$
                {formatDollar(Math.abs(result.potBalance))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="font-display text-sm font-semibold text-fg-muted uppercase tracking-wide mb-4 flex items-center justify-between gap-3">
          <span>
            {result.transactions.length === 0
              ? "✅ All Settled"
              : "💸 Settlement Instructions"}
          </span>
          {result.transactions.length > 0 && (
            <span className="font-mono text-xs text-fg-dim normal-case tracking-normal">
              {paidCount}/{result.transactions.length} paid
            </span>
          )}
        </div>
        {result.transactions.length === 0 ? (
          <div className="text-center text-fg-dim py-8">
            Everyone is even. No payments needed.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {result.transactions.map((t, i) => {
              const isPaid = !!paid[i];
              return (
                <label
                  key={i}
                  className={`flex items-center justify-between gap-3 p-3.5 rounded-[10px] bg-bg-elevated border border-border border-l-[3px] border-l-accent text-sm cursor-pointer transition-opacity ${
                    isPaid ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 flex-wrap min-w-0">
                    <input
                      type="checkbox"
                      checked={isPaid}
                      onChange={() => toggle(i)}
                      disabled={!!paymentsDisabled}
                      className="w-4 h-4 accent-accent cursor-pointer flex-shrink-0 disabled:cursor-not-allowed"
                      aria-label={`Mark payment from ${t.from} to ${t.to} as paid`}
                    />
                    <div
                      className={`flex items-center gap-2.5 flex-wrap min-w-0 ${
                        isPaid ? "line-through" : ""
                      }`}
                    >
                      <strong className="font-semibold">{t.from}</strong>
                      <span className="text-fg-dim text-xs">→</span>
                      <strong className="font-semibold">{t.to}</strong>
                    </div>
                  </div>
                  <span
                    className={`font-mono font-semibold text-accent text-[15px] flex-shrink-0 ${
                      isPaid ? "line-through" : ""
                    }`}
                  >
                    ${formatDollar(t.amount)}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
