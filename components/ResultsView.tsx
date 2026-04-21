import { formatDollar } from "@/lib/calc";
import type { CalculationResult } from "@/lib/types";

export function ResultsView({ result }: { result: CalculationResult }) {
  const isBalanced = Math.abs(result.totalNet) < 0.01;

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
        <div className="font-display text-sm font-semibold text-fg-muted uppercase tracking-wide mb-4">
          {result.transactions.length === 0
            ? "✅ All Settled"
            : "💸 Settlement Instructions"}
        </div>
        {result.transactions.length === 0 ? (
          <div className="text-center text-fg-dim py-8">
            Everyone is even. No payments needed.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {result.transactions.map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-3.5 rounded-[10px] bg-bg-elevated border border-border border-l-[3px] border-l-accent text-sm"
              >
                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                  <strong className="font-semibold">{t.from}</strong>
                  <span className="text-fg-dim text-xs">→</span>
                  <strong className="font-semibold">{t.to}</strong>
                </div>
                <span className="font-mono font-semibold text-accent text-[15px] flex-shrink-0">
                  ${formatDollar(t.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
