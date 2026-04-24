"use client";

import { useState } from "react";
import { formatDollar } from "@/lib/calc";
import type { Report, Role } from "@/lib/types";
import { PlayerRow } from "./PlayerRow";
import { ResultsView } from "./ResultsView";
import { toast } from "./Toaster";

export function ReportsView({
  initialReports,
  role,
}: {
  initialReports: Report[];
  role: Role;
}) {
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [openId, setOpenId] = useState<string | null>(null);
  const canWrite = role === "admin" || role === "editor";

  async function refresh() {
    const res = await fetch("/api/reports", { cache: "no-store" });
    if (res.ok) {
      const { reports } = (await res.json()) as { reports: Report[] };
      setReports(reports);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this report permanently?")) return;
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (openId === id) setOpenId(null);
      toast("Report deleted", "success");
    } else {
      toast("Delete failed", "error");
    }
  }

  function exportAll() {
    if (reports.length === 0) {
      toast("No reports to export", "error");
      return;
    }
    const blob = new Blob([JSON.stringify(reports, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chip-kings-reports-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Exported ✓", "success");
  }

  const openReport = reports.find((r) => r.id === openId) || null;

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            📁 Saved Games
          </h2>
          <div className="flex gap-2">
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
              No saved games yet. Finish a calculation and tap &ldquo;Save to Games&rdquo;.
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => {
                const s = r.snapshot;
                return (
                  <div
                    key={r.id}
                    className="card !mb-0 cursor-pointer hover:border-border-strong transition-all hover:-translate-y-px"
                    onClick={() => setOpenId(r.id)}
                  >
                    <div className="card-body pt-4 pb-4">
                      <div className="flex justify-between items-start gap-3 mb-2.5">
                        <div>
                          <div className="font-display font-semibold text-[15px]">
                            {r.title}
                          </div>
                          <div className="text-xs text-fg-dim font-mono mt-0.5">
                            {new Date(r.createdAt).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {" · "}
                            {r.createdBy}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3.5 text-xs text-fg-muted font-mono">
                        <span>👥 {s.playerCount} players</span>
                        <span>💸 {s.transactions.length} settlements</span>
                        {s.hasPot && (
                          <span>
                            💰 POT {s.potBalance >= 0 ? "+" : "−"}$
                            {formatDollar(Math.abs(s.potBalance))}
                          </span>
                        )}
                      </div>
                      <div
                        className="flex gap-1.5 mt-3 pt-3 border-t border-border"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => setOpenId(r.id)}
                        >
                          👁 View
                        </button>
                        {canWrite && (
                          <button
                            className="btn btn-danger btn-small"
                            onClick={() => remove(r.id)}
                          >
                            🗑 Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {openReport && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur flex items-center justify-center p-5 animate-fade-in"
          onClick={() => setOpenId(null)}
        >
          <div
            className="bg-bg-card border border-border rounded-[14px] max-w-2xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex justify-between items-center">
              <div className="font-display text-lg font-semibold truncate">
                {openReport.title}
              </div>
              <button
                onClick={() => setOpenId(null)}
                className="w-9 h-9 rounded-[10px] bg-bg-elevated border border-border text-fg-muted hover:bg-bg-subtle grid place-items-center"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
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
                    <PlayerRow
                      key={`${p.name}-${i}`}
                      person={p}
                      index={i}
                      readOnly
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2.5">
              <button onClick={() => setOpenId(null)} className="btn btn-ghost">
                Close
              </button>
              {canWrite && (
                <button
                  onClick={() => remove(openReport.id)}
                  className="btn btn-danger"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
