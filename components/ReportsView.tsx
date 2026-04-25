"use client";

import { useMemo, useState } from "react";
import { formatDollar, isPot } from "@/lib/calc";
import type { Reconciliation, Report, Role } from "@/lib/types";
import { PlayerRow } from "./PlayerRow";
import { ResultsView } from "./ResultsView";
import { toast } from "./Toaster";
import { ConfirmDialog } from "./ConfirmDialog";

export function ReportsView({
  initialReports,
  initialReconciliations,
  role,
}: {
  initialReports: Report[];
  initialReconciliations: Reconciliation[];
  role: Role;
}) {
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>(
    initialReconciliations
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [openReconId, setOpenReconId] = useState<string | null>(null);
  const [confirmReconcile, setConfirmReconcile] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [pendingDeleteReport, setPendingDeleteReport] = useState<Report | null>(null);
  const [pendingDeleteRecon, setPendingDeleteRecon] = useState<Reconciliation | null>(null);
  const canWrite = role === "admin" || role === "editor";

  const selectedReports = useMemo(
    () => reports.filter((r) => selected.has(r.id)),
    [reports, selected]
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refresh() {
    const [rRes, recRes] = await Promise.all([
      fetch("/api/reports", { cache: "no-store" }),
      fetch("/api/reconciliations", { cache: "no-store" }),
    ]);
    if (rRes.ok) {
      const { reports } = (await rRes.json()) as { reports: Report[] };
      setReports(reports);
    }
    if (recRes.ok) {
      const { reconciliations } = (await recRes.json()) as {
        reconciliations: Reconciliation[];
      };
      setReconciliations(reconciliations);
    }
    setSelected(new Set());
  }

  async function removeReport(id: string) {
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (openReportId === id) setOpenReportId(null);
      toast("Game deleted", "success");
    } else {
      toast("Delete failed", "error");
    }
  }

  async function removeReconciliation(id: string) {
    const res = await fetch(`/api/reconciliations/${id}`, { method: "DELETE" });
    if (res.ok) {
      setReconciliations((prev) => prev.filter((r) => r.id !== id));
      if (openReconId === id) setOpenReconId(null);
      toast("Reconciliation deleted", "success");
    } else {
      toast("Delete failed", "error");
    }
  }

  async function reconcileSelected() {
    if (selected.size < 1) return;
    setReconciling(true);
    try {
      const res = await fetch("/api/reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportIds: Array.from(selected) }),
      });
      const data = (await res.json()) as {
        reconciliation?: Reconciliation;
        error?: string;
      };
      if (!res.ok || !data.reconciliation) {
        throw new Error(data.error || "Reconcile failed");
      }
      const reconciledIds = new Set(data.reconciliation.reportIds);
      setReports((prev) => prev.filter((r) => !reconciledIds.has(r.id)));
      setReconciliations((prev) => [data.reconciliation!, ...prev]);
      setSelected(new Set());
      toast("Reconciled ✓", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Reconcile failed", "error");
    } finally {
      setReconciling(false);
      setConfirmReconcile(false);
    }
  }

  function exportAll() {
    if (reports.length === 0 && reconciliations.length === 0) {
      toast("Nothing to export", "error");
      return;
    }
    const blob = new Blob(
      [JSON.stringify({ reports, reconciliations }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chip-kings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Exported ✓", "success");
  }

  const openReport = reports.find((r) => r.id === openReportId) || null;
  const openRecon =
    reconciliations.find((r) => r.id === openReconId) || null;

  return (
    <>
      {/* Saved Games */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            📁 Saved Games
            {selected.size > 0 && (
              <span className="text-xs text-fg-dim font-mono">
                ({selected.size} selected)
              </span>
            )}
          </h2>
          <div className="flex gap-2">
            {canWrite && selected.size > 0 && (
              <button
                onClick={() => setConfirmReconcile(true)}
                className="btn btn-small"
                disabled={reconciling}
              >
                ⚖ Reconcile {selected.size}
              </button>
            )}
            <button onClick={refresh} className="btn btn-ghost btn-small" title="Refresh">
              ↻
            </button>
            <button onClick={exportAll} className="btn btn-ghost btn-small" title="Export">
              ⬇ Export
            </button>
          </div>
        </div>
        <div className="card-body">
          {reports.length === 0 ? (
            <div className="text-center py-10 text-fg-dim text-sm">
              <span className="block text-3xl mb-2">📭</span>
              No saved games yet. Finish a calculation and tap &ldquo;Save Game&rdquo;.
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <ReportCard
                  key={r.id}
                  report={r}
                  selected={selected.has(r.id)}
                  canWrite={canWrite}
                  onToggleSelect={() => toggleSelect(r.id)}
                  onView={() => setOpenReportId(r.id)}
                  onDelete={() => setPendingDeleteReport(r)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reconciled */}
      {reconciliations.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
              ⚖ Reconciled
              <span className="text-xs text-fg-dim font-mono">
                ({reconciliations.length})
              </span>
            </h2>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              {reconciliations.map((r) => (
                <ReconciliationCard
                  key={r.id}
                  recon={r}
                  canWrite={canWrite}
                  onView={() => setOpenReconId(r.id)}
                  onDelete={() => setPendingDeleteRecon(r)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Game modal */}
      {openReport && (
        <DetailModal title={openReport.title} onClose={() => setOpenReportId(null)}>
          <div className="text-xs text-fg-dim font-mono mb-4">
            {new Date(openReport.createdAt).toLocaleString()}
            {" · "}
            {openReport.createdBy}
          </div>
          <ResultsView result={openReport.snapshot} reportId={openReport.id} />
          <div className="mt-5">
            <div className="font-display text-sm font-semibold text-fg-muted uppercase tracking-wide mb-3">
              Players
            </div>
            <div className="flex flex-col gap-2">
              {openReport.snapshot.people.map((p, i) => (
                <PlayerRow key={`${p.name}-${i}`} person={p} index={i} readOnly />
              ))}
            </div>
          </div>
        </DetailModal>
      )}

      {/* Reconciliation modal */}
      {openRecon && (
        <DetailModal title={openRecon.title} onClose={() => setOpenReconId(null)}>
          <div className="text-xs text-fg-dim font-mono mb-4">
            {new Date(openRecon.createdAt).toLocaleString()}
            {" · "}
            {openRecon.createdBy}
          </div>
          <div className="mb-4 text-xs text-fg-muted">
            Combined from{" "}
            <strong className="text-fg">{openRecon.reportTitles.length}</strong>{" "}
            game{openRecon.reportTitles.length === 1 ? "" : "s"}:
            <ul className="mt-1.5 list-disc list-inside text-fg-dim">
              {openRecon.reportTitles.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
          <ResultsView result={openRecon.snapshot} reportId={openRecon.id} />
          <div className="mt-5">
            <div className="font-display text-sm font-semibold text-fg-muted uppercase tracking-wide mb-3">
              Players
            </div>
            <div className="flex flex-col gap-2">
              {openRecon.snapshot.people.map((p, i) => (
                <PlayerRow key={`${p.name}-${i}`} person={p} index={i} readOnly />
              ))}
            </div>
          </div>
        </DetailModal>
      )}

      {/* Reconcile confirm */}
      <ConfirmDialog
        open={confirmReconcile}
        title={`Reconcile ${selected.size} game${selected.size === 1 ? "" : "s"}?`}
        message="Selected games will be combined into a single reconciliation and removed from the saved games list. This cannot be undone."
        itemName={
          selected.size > 0
            ? selectedReports
                .map((r) => r.title)
                .slice(0, 3)
                .join(", ") + (selectedReports.length > 3 ? "…" : "")
            : undefined
        }
        confirmLabel={reconciling ? "Reconciling…" : "Reconcile"}
        onCancel={() => !reconciling && setConfirmReconcile(false)}
        onConfirm={reconcileSelected}
      />

      {/* Delete game confirm */}
      <ConfirmDialog
        open={!!pendingDeleteReport}
        danger
        title="Delete game?"
        message="This permanently removes the saved game."
        itemName={pendingDeleteReport?.title}
        confirmLabel="Delete game"
        onCancel={() => setPendingDeleteReport(null)}
        onConfirm={() => {
          if (pendingDeleteReport) removeReport(pendingDeleteReport.id);
          setPendingDeleteReport(null);
        }}
      />

      {/* Delete reconciliation confirm */}
      <ConfirmDialog
        open={!!pendingDeleteRecon}
        danger
        title="Delete reconciliation?"
        message="This removes the reconciled record. The original games are not restored."
        itemName={pendingDeleteRecon?.title}
        confirmLabel="Delete reconciliation"
        onCancel={() => setPendingDeleteRecon(null)}
        onConfirm={() => {
          if (pendingDeleteRecon) removeReconciliation(pendingDeleteRecon.id);
          setPendingDeleteRecon(null);
        }}
      />
    </>
  );
}

function ReportCard({
  report,
  selected,
  canWrite,
  onToggleSelect,
  onView,
  onDelete,
}: {
  report: Report;
  selected: boolean;
  canWrite: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onDelete: () => void;
}) {
  const s = report.snapshot;
  return (
    <div
      className={`card !mb-0 transition-all ${
        selected ? "border-accent" : "hover:border-border-strong"
      }`}
    >
      <div className="card-body pt-4 pb-4">
        <div className="flex items-start gap-3">
          {canWrite && (
            <label className="pt-1 flex-shrink-0 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-accent cursor-pointer"
                checked={selected}
                onChange={onToggleSelect}
                aria-label={`Select ${report.title}`}
              />
            </label>
          )}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={onView}
          >
            <div className="font-display font-semibold text-[15px]">
              {report.title}
            </div>
            <div className="text-xs text-fg-dim font-mono mt-0.5">
              {new Date(report.createdAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {" · "}
              {report.createdBy}
            </div>
            <div className="flex flex-wrap gap-3.5 text-xs text-fg-muted font-mono mt-2">
              <span>👥 {s.playerCount} players</span>
              {s.hasPot && (
                <span>
                  💰 POT {s.potBalance >= 0 ? "+" : "−"}$
                  {formatDollar(Math.abs(s.potBalance))}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-3 pt-3 border-t border-border">
          <button className="btn btn-secondary btn-small" onClick={onView}>
            👁 View
          </button>
          {canWrite && (
            <a
              className="btn btn-secondary btn-small"
              href={`/?edit=${report.id}`}
            >
              ✏️ Edit
            </a>
          )}
          {canWrite && (
            <button className="btn btn-danger btn-small" onClick={onDelete}>
              🗑 Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReconciliationCard({
  recon,
  canWrite,
  onView,
  onDelete,
}: {
  recon: Reconciliation;
  canWrite: boolean;
  onView: () => void;
  onDelete: () => void;
}) {
  const s = recon.snapshot;
  const summary = useMemo(() => buildReconSummary(recon), [recon]);

  return (
    <div
      className="card !mb-0 cursor-pointer hover:border-border-strong transition-all"
      onClick={onView}
    >
      <div className="card-body pt-4 pb-4">
        <div className="font-display font-semibold text-[15px]">
          {recon.title}
        </div>
        <div className="text-xs text-fg-dim font-mono mt-0.5">
          {new Date(recon.createdAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          {" · "}
          {recon.createdBy}
        </div>
        <div className="flex flex-wrap gap-3.5 text-xs text-fg-muted font-mono mt-2">
          <span>📚 {recon.reportTitles.length} games</span>
          <span>👥 {s.playerCount} players</span>
          <span>💸 {s.transactions.length} settlements</span>
          <span>💵 ${formatDollar(summary.totalSettled)} settled</span>
        </div>

        {(summary.topWinner || summary.topLoser) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            {summary.topWinner && (
              <div className="rounded-[10px] bg-bg-elevated border border-border px-3 py-2 flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span>🏆</span>
                  <span className="text-[11px] text-fg-dim uppercase tracking-wide font-mono">
                    Top winner
                  </span>
                  <strong className="font-semibold truncate">
                    {summary.topWinner.name}
                  </strong>
                </span>
                <span className="font-mono font-semibold text-success">
                  +${formatDollar(summary.topWinner.earnings)}
                </span>
              </div>
            )}
            {summary.topLoser && (
              <div className="rounded-[10px] bg-bg-elevated border border-border px-3 py-2 flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span>📉</span>
                  <span className="text-[11px] text-fg-dim uppercase tracking-wide font-mono">
                    Top loser
                  </span>
                  <strong className="font-semibold truncate">
                    {summary.topLoser.name}
                  </strong>
                </span>
                <span className="font-mono font-semibold text-danger">
                  −${formatDollar(Math.abs(summary.topLoser.earnings))}
                </span>
              </div>
            )}
          </div>
        )}

        {summary.previewTransactions.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {summary.previewTransactions.map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 text-[13px] text-fg-muted px-3 py-1.5 rounded-md bg-bg-subtle"
              >
                <span className="truncate">
                  <strong className="text-fg">{t.from}</strong>
                  <span className="text-fg-dim mx-1.5">→</span>
                  <strong className="text-fg">{t.to}</strong>
                </span>
                <span className="font-mono font-semibold text-accent flex-shrink-0">
                  ${formatDollar(t.amount)}
                </span>
              </div>
            ))}
            {summary.remainingTransactions > 0 && (
              <div className="text-[11px] text-fg-dim text-center font-mono">
                + {summary.remainingTransactions} more settlement
                {summary.remainingTransactions === 1 ? "" : "s"}
              </div>
            )}
          </div>
        )}

        <div
          className="flex gap-1.5 mt-3 pt-3 border-t border-border"
          onClick={(e) => e.stopPropagation()}
        >
          <button className="btn btn-secondary btn-small" onClick={onView}>
            👁 View
          </button>
          {canWrite && (
            <button className="btn btn-danger btn-small" onClick={onDelete}>
              🗑 Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function buildReconSummary(recon: Reconciliation) {
  const s = recon.snapshot;
  const players = s.people.filter((p) => !isPot(p.name));
  const sorted = [...players].sort((a, b) => b.earnings - a.earnings);
  const topWinner = sorted[0] && sorted[0].earnings > 0 ? sorted[0] : null;
  const last = sorted[sorted.length - 1];
  const topLoser = last && last.earnings < 0 ? last : null;
  const totalSettled = s.transactions.reduce((sum, t) => sum + t.amount, 0);
  const previewTransactions = s.transactions.slice(0, 3);
  const remainingTransactions = Math.max(
    0,
    s.transactions.length - previewTransactions.length
  );
  return { topWinner, topLoser, totalSettled, previewTransactions, remainingTransactions };
}

function DetailModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur flex items-center justify-center p-5 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border rounded-[14px] max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex justify-between items-center">
          <div className="font-display text-lg font-semibold truncate">{title}</div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-[10px] bg-bg-elevated border border-border text-fg-muted hover:bg-bg-subtle grid place-items-center"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        <div className="px-5 py-3.5 border-t border-border flex justify-end">
          <button onClick={onClose} className="btn btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
