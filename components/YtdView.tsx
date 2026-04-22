"use client";

import { useMemo, useState } from "react";
import { formatDollar, summarizeYtd } from "@/lib/calc";
import type { Report } from "@/lib/types";

export function YtdView({ reports }: { reports: Report[] }) {
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const r of reports) {
      const d = new Date(r.createdAt);
      if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
    }
    const current = new Date().getFullYear();
    years.add(current);
    return Array.from(years).sort((a, b) => b - a);
  }, [reports]);

  const [year, setYear] = useState<number>(availableYears[0] ?? new Date().getFullYear());
  const summary = useMemo(() => summarizeYtd(reports, year), [reports, year]);

  const topNet = summary.players[0]?.net ?? 0;
  const bottomNet = summary.players[summary.players.length - 1]?.net ?? 0;
  const maxAbs = Math.max(Math.abs(topNet), Math.abs(bottomNet), 1);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            📈 Year to Date
          </h2>
          <select
            className="input !w-auto !py-1.5 !px-2.5 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="stat">
              <div className="stat-label">Games</div>
              <div className="stat-value">{summary.gameCount}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Players</div>
              <div className="stat-value">{summary.playerCount}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Total Expenses</div>
              <div className="stat-value">${formatDollar(summary.totalExpenses)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">POT Balance</div>
              <div
                className={`stat-value ${
                  summary.potBalance >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {summary.potBalance >= 0 ? "+" : "−"}$
                {formatDollar(Math.abs(summary.potBalance))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            🏆 Leaderboard
          </h2>
        </div>
        <div className="card-body">
          {summary.players.length === 0 ? (
            <div className="text-center py-10 text-fg-dim text-sm">
              <span className="block text-3xl mb-2">📭</span>
              No reports saved in {year}.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {summary.players.map((p, i) => {
                const pct = (Math.abs(p.net) / maxAbs) * 100;
                const positive = p.net >= 0;
                return (
                  <div
                    key={p.name}
                    className="rounded-[10px] bg-bg-elevated border border-border p-3.5"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-fg-dim text-xs font-mono w-5 text-right">
                          {i + 1}
                        </span>
                        <strong className="font-semibold truncate">{p.name}</strong>
                        <span className="text-[11px] text-fg-dim font-mono">
                          {p.gamesPlayed} {p.gamesPlayed === 1 ? "game" : "games"}
                        </span>
                      </div>
                      <span
                        className={`font-mono font-semibold text-[15px] ${
                          positive ? "text-success" : "text-danger"
                        }`}
                      >
                        {positive ? "+" : "−"}${formatDollar(Math.abs(p.net))}
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
                    <div className="flex gap-4 mt-2 text-[11px] text-fg-muted font-mono">
                      <span>
                        W/L: {p.earnings >= 0 ? "+" : "−"}$
                        {formatDollar(Math.abs(p.earnings))}
                      </span>
                      <span>Expenses: ${formatDollar(p.expenses)}</span>
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
