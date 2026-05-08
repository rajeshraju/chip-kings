"use client";

import { useMemo } from "react";
import { formatDollar } from "@/lib/calc";
import type { PotLedgerEntry } from "@/lib/types";
import { exportElementToPdf } from "@/lib/print";

const PRINT_ID = "pot-print-area";

export function PotView({ entries }: { entries: PotLedgerEntry[] }) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.amount - a.amount),
    [entries]
  );

  const owedByPot = entries
    .filter((e) => e.amount > 0)
    .reduce((s, e) => s + e.amount, 0);
  const owedToPot = entries
    .filter((e) => e.amount < 0)
    .reduce((s, e) => s + Math.abs(e.amount), 0);
  // POT ledger total = owed TO POT − POT owes. Positive means players
  // collectively owe the pot (pot is in surplus); negative means the pot
  // owes more out than it has coming in.
  const net = owedToPot - owedByPot;
  const maxAbs = Math.max(
    ...entries.map((e) => Math.abs(e.amount)),
    1
  );

  return (
    <div className="space-y-4" id={PRINT_ID}>
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            💰 Pot Ledger
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-small no-print"
            onClick={() => exportElementToPdf(PRINT_ID, "Pot-Ledger")}
            title="Export as PDF"
          >
            ⬇ PDF
          </button>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="stat">
              <div className="stat-label">Players</div>
              <div className="stat-value">{entries.length}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Pot Owes</div>
              <div className="stat-value text-success">
                ${formatDollar(owedByPot)}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Owed to Pot</div>
              <div className="stat-value text-danger">
                ${formatDollar(owedToPot)}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Net</div>
              <div
                className={`stat-value ${
                  net >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {net >= 0 ? "+" : "−"}${formatDollar(Math.abs(net))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            📒 Per-player balances
          </h2>
        </div>
        <div className="card-body">
          {sorted.length === 0 ? (
            <div className="text-center py-10 text-fg-dim text-sm">
              <span className="block text-3xl mb-2">📭</span>
              No pot ledger entries yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sorted.map((e) => {
                const positive = e.amount >= 0;
                const pct = (Math.abs(e.amount) / maxAbs) * 100;
                return (
                  <div
                    key={e.name}
                    className="rounded-[10px] bg-bg-elevated border border-border p-3.5"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <strong className="font-semibold truncate">{e.name}</strong>
                        <span className="text-[10px] uppercase tracking-wider text-fg-dim font-mono">
                          {e.amount === 0
                            ? "even"
                            : positive
                            ? "gets from pot"
                            : "owes pot"}
                        </span>
                      </div>
                      <span
                        className={`font-mono font-semibold text-[15px] ${
                          e.amount === 0
                            ? "text-fg-muted"
                            : positive
                            ? "text-success"
                            : "text-danger"
                        }`}
                      >
                        {e.amount === 0
                          ? "$0"
                          : `${positive ? "+" : "−"}$${formatDollar(
                              Math.abs(e.amount)
                            )}`}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-bg-subtle overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          positive ? "bg-success" : "bg-danger"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-fg-dim font-mono mt-2">
                      updated {new Date(e.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
