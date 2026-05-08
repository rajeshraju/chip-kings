"use client";

import { useEffect, useMemo, useState } from "react";
import { buildPeriodRange, formatDollar, summarizeYtd } from "@/lib/calc";
import type { PeriodKind } from "@/lib/calc";
import type { Report } from "@/lib/types";
import { exportElementToPdf } from "@/lib/print";

const PRINT_ID = "ytd-print-area";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function YtdView({ reports }: { reports: Report[] }) {
  // Derived strictly from props so SSR and client agree. Current year is
  // added in an effect after mount to avoid hydration mismatches caused by
  // server/client clock or timezone differences.
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const r of reports) {
      const d = new Date(r.createdAt);
      if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [reports]);

  const [kind, setKind] = useState<PeriodKind>("year");
  const [year, setYear] = useState<number>(() => availableYears[0] ?? 0);
  const [month, setMonth] = useState<number>(1);
  const [quarter, setQuarter] = useState<number>(1);

  // On mount, jump to the current month/quarter/year for convenience. Runs
  // client-side only, so no SSR mismatch.
  useEffect(() => {
    const now = new Date();
    setMonth(now.getMonth() + 1);
    setQuarter(Math.floor(now.getMonth() / 3) + 1);
    setYear((y) => {
      if (y && availableYears.includes(y)) return y;
      return availableYears.includes(now.getFullYear())
        ? now.getFullYear()
        : availableYears[0] ?? now.getFullYear();
    });
    // Mount-only effect; year-validity reconciliation is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep year valid when reports list changes (e.g., refresh).
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(year)) {
      setYear(availableYears[0]);
    }
  }, [availableYears, year]);

  const range = useMemo(
    () =>
      buildPeriodRange(
        kind,
        year,
        kind === "month" ? month : kind === "quarter" ? quarter : undefined
      ),
    [kind, year, month, quarter]
  );

  const summary = useMemo(() => summarizeYtd(reports, range), [reports, range]);

  const topNet = summary.players[0]?.net ?? 0;
  const bottomNet = summary.players[summary.players.length - 1]?.net ?? 0;
  const maxAbs = Math.max(Math.abs(topNet), Math.abs(bottomNet), 1);

  return (
    <div className="space-y-4" id={PRINT_ID}>
      <div className="card">
        <div className="card-header flex-wrap gap-3">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            📈 {range.label}
          </h2>
          <div className="flex flex-wrap gap-2 items-center no-print">
            <select
              className="input !w-auto !py-1.5 !px-2.5 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as PeriodKind)}
              aria-label="Period type"
            >
              <option value="year">Year</option>
              <option value="quarter">Quarter</option>
              <option value="month">Month</option>
            </select>
            {kind === "month" && (
              <select
                className="input !w-auto !py-1.5 !px-2.5 text-sm"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="Month"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            {kind === "quarter" && (
              <select
                className="input !w-auto !py-1.5 !px-2.5 text-sm"
                value={quarter}
                onChange={(e) => setQuarter(Number(e.target.value))}
                aria-label="Quarter"
              >
                <option value={1}>Q1</option>
                <option value={2}>Q2</option>
                <option value={3}>Q3</option>
                <option value={4}>Q4</option>
              </select>
            )}
            <select
              className="input !w-auto !py-1.5 !px-2.5 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Year"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => exportElementToPdf(PRINT_ID, `YTD-${range.label}`)}
              title="Export as PDF"
            >
              ⬇ PDF
            </button>
          </div>
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
              <div className="stat-label">Winnings</div>
              <div className="stat-value text-success">
                +${formatDollar(summary.totalWinnings)}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Losses</div>
              <div className="stat-value text-danger">
                −${formatDollar(summary.totalLosses)}
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
              No reports saved in {range.label}.
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            💸 Expenses
          </h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="stat">
              <div className="stat-label">Total Expenses</div>
              <div className="stat-value">
                ${formatDollar(summary.totalExpenses)}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Player Expenses</div>
              <div className="stat-value">
                ${formatDollar(summary.playerExpenses)}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">POT Expenses</div>
              <div className="stat-value">
                ${formatDollar(summary.potExpenses)}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Total Pot</div>
              <div className="stat-value">
                ${formatDollar(summary.totalPot)}
              </div>
            </div>
          </div>

          {summary.players.length === 0 ? (
            <div className="text-center py-6 text-fg-dim text-sm">
              No expenses recorded in {range.label}.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-xs uppercase tracking-wide text-fg-dim font-mono mb-1">
                Per Player
              </div>
              {[...summary.players]
                .sort((a, b) => b.expenses - a.expenses)
                .map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-[10px] bg-bg-elevated border border-border text-sm"
                  >
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="font-mono font-semibold">
                      ${formatDollar(p.expenses)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
