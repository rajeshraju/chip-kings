"use client";

import { useMemo, useState } from "react";
import { formatDollar } from "@/lib/calc";
import type { Reconciliation, Transaction } from "@/lib/types";

type Draft = {
  from: string;
  to: string;
  amount: string;
};

function toDraft(t: Transaction): Draft {
  return { from: t.from, to: t.to, amount: String(Math.round(t.amount)) };
}

function toTransaction(d: Draft): Transaction {
  return {
    from: d.from.trim(),
    to: d.to.trim(),
    amount: Math.round(Number(d.amount) || 0),
  };
}

export function ReconciliationEditor({
  recon,
  onCancel,
  onSave,
}: {
  recon: Reconciliation;
  onCancel: () => void;
  onSave: (transactions: Transaction[]) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    recon.snapshot.transactions.map(toDraft)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerNames = useMemo(
    () => recon.snapshot.people.map((p) => p.name.trim()),
    [recon.snapshot.people]
  );

  // Whole-reconciliation total: original sum of settlement amounts. The new
  // settlements may redistribute who-pays-whom, but the aggregate must match.
  const originalTotal = useMemo(
    () =>
      recon.snapshot.transactions.reduce(
        (s, t) => s + (Number(t.amount) || 0),
        0
      ),
    [recon.snapshot.transactions]
  );

  const currentTotal = useMemo(
    () =>
      drafts.reduce((s, d) => {
        const amt = Math.round(Number(d.amount) || 0);
        return s + (amt > 0 ? amt : 0);
      }, 0),
    [drafts]
  );

  const totalsMatch = Math.abs(currentTotal - originalTotal) < 1;

  const draftsValid = drafts.every((d) => {
    const amt = Math.round(Number(d.amount) || 0);
    return amt > 0 && d.from && d.to && d.from !== d.to;
  });
  const canSave = drafts.length > 0 && draftsValid && totalsMatch && !saving;

  function update(i: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function remove(i: number) {
    setDrafts((prev) => prev.filter((_, idx) => idx !== i));
  }

  function add() {
    setDrafts((prev) => [
      ...prev,
      {
        from: playerNames[0] ?? "",
        to: playerNames[1] ?? playerNames[0] ?? "",
        amount: "0",
      },
    ]);
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(drafts.map(toTransaction));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="font-display text-sm font-semibold text-fg-muted uppercase tracking-wide mb-3">
          Edit Settlements
        </div>
        <div className="text-xs text-fg-dim mb-4">
          Adjust how much each player pays whom. Save is enabled when the
          total settled amount equals the original reconciliation total —
          you can redistribute who-pays-whom freely.
        </div>

        <div
          className={`alert ${totalsMatch ? "alert-success" : "alert-warning"} mb-4 flex items-center justify-between gap-3`}
        >
          <span>
            {totalsMatch ? (
              <>✓ Reconciliation total matches — ready to save</>
            ) : (
              <>
                ⚠ Off by ${formatDollar(Math.abs(currentTotal - originalTotal))}
              </>
            )}
          </span>
          <span className="font-mono text-xs">
            ${formatDollar(currentTotal)} / ${formatDollar(originalTotal)}
          </span>
        </div>

        {/* Editable transaction rows */}
        <div className="flex flex-col gap-2">
          {drafts.length === 0 ? (
            <div className="text-center text-fg-dim text-sm py-4">
              No settlements. Add one to get started.
            </div>
          ) : (
            drafts.map((d, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-2 items-center p-2.5 rounded-[10px] bg-bg-elevated border border-border"
              >
                <PlayerSelect
                  label="From"
                  value={d.from}
                  options={playerNames}
                  onChange={(v) => update(i, { from: v })}
                />
                <span className="text-fg-dim text-xs">→</span>
                <PlayerSelect
                  label="To"
                  value={d.to}
                  options={playerNames}
                  onChange={(v) => update(i, { to: v })}
                />
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide font-mono text-fg-dim">
                    Amount
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={d.amount}
                    onChange={(e) => update(i, { amount: e.target.value })}
                    className="w-24 bg-bg border border-border rounded-md px-2 py-1.5 text-sm font-mono text-right focus:border-accent focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="self-end btn btn-ghost btn-small"
                  title="Remove settlement"
                  aria-label="Remove settlement"
                >
                  ✕
                </button>
              </div>
            ))
          )}

          <button
            type="button"
            onClick={add}
            className="btn btn-secondary btn-small self-start mt-1"
          >
            + Add settlement
          </button>
        </div>

        {error && <div className="alert alert-warning mt-4 text-sm">{error}</div>}

        <div className="flex gap-2 mt-5 justify-end">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleSave}
            disabled={!canSave}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlayerSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] uppercase tracking-wide font-mono text-fg-dim">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg border border-border rounded-md px-2 py-1.5 text-sm focus:border-accent focus:outline-none truncate"
      >
        {!options.includes(value) && value && (
          <option value={value}>{value}</option>
        )}
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
