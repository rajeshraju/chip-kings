"use client";

import { useState } from "react";
import type { Settings } from "@/lib/settings";
import { ConfirmDialog } from "./ConfirmDialog";
import { toast } from "./Toaster";
import { refreshAfterSuccess } from "@/lib/refresh";

type ResetTarget = "reports" | "reconciliations" | "pot";

const RESET_OPTIONS: {
  target: ResetTarget;
  label: string;
  emoji: string;
  description: string;
}[] = [
  {
    target: "reports",
    label: "Games (reports.json)",
    emoji: "🃏",
    description:
      "Deletes every saved game. Reconciliations and pot ledger are not touched.",
  },
  {
    target: "reconciliations",
    label: "Reconciliations (reconciliations.json)",
    emoji: "⚖",
    description:
      "Deletes every reconciliation record. Source games are NOT restored. Pot ledger entries are not touched.",
  },
  {
    target: "pot",
    label: "Pot Ledger (pot.json)",
    emoji: "💰",
    description:
      "Wipes the per-player pot ledger balances. Games and reconciliations are not touched.",
  },
];

export function SettingsManager({
  initialSettings,
}: {
  initialSettings: Settings;
}) {
  const [initialChipsTaken, setInitialChipsTaken] = useState<string>(
    String(initialSettings.initialChipsTaken)
  );
  const [chipsIncrement, setChipsIncrement] = useState<string>(
    String(initialSettings.chipsIncrement)
  );
  const [saving, setSaving] = useState(false);
  const [pendingReset, setPendingReset] = useState<ResetTarget | null>(null);
  const [resetting, setResetting] = useState<ResetTarget | null>(null);

  async function saveSettings() {
    const initial = parseInt(initialChipsTaken, 10);
    const inc = parseInt(chipsIncrement, 10);
    if (Number.isNaN(initial) || initial < 0) {
      toast("Initial chips must be a non-negative number", "error");
      return;
    }
    if (Number.isNaN(inc) || inc < 1) {
      toast("Increment must be at least 1", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialChipsTaken: initial,
          chipsIncrement: inc,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: Settings;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        throw new Error(data.error || "Save failed");
      }
      setInitialChipsTaken(String(data.settings.initialChipsTaken));
      setChipsIncrement(String(data.settings.chipsIncrement));
      toast("Settings saved ✓", "success");
      refreshAfterSuccess();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function performReset(target: ResetTarget) {
    setResetting(target);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Reset failed");
      toast(`Reset ${target} ✓`, "success");
      refreshAfterSuccess();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Reset failed", "error");
    } finally {
      setResetting(null);
      setPendingReset(null);
    }
  }

  const pending = RESET_OPTIONS.find((o) => o.target === pendingReset) ?? null;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            🎯 Game Defaults
          </h2>
        </div>
        <div className="card-body space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="initial-chips">
                Initial Chips Count
              </label>
              <input
                id="initial-chips"
                className="input"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={initialChipsTaken}
                onChange={(e) => setInitialChipsTaken(e.target.value)}
              />
              <div className="text-xs text-fg-dim mt-1.5">
                Default value used for &ldquo;Chips Taken&rdquo; on the Session
                page when adding a player.
              </div>
            </div>
            <div>
              <label className="label" htmlFor="chips-increment">
                Chips Increment
              </label>
              <input
                id="chips-increment"
                className="input"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={chipsIncrement}
                onChange={(e) => setChipsIncrement(e.target.value)}
              />
              <div className="text-xs text-fg-dim mt-1.5">
                Step size for the +/- buttons next to &ldquo;Chips Taken&rdquo;.
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="btn"
              onClick={saveSettings}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            🧹 Reset Data
          </h2>
        </div>
        <div className="card-body space-y-3">
          <div className="alert alert-warning text-sm">
            ⚠ Resets are permanent and cannot be undone. Each option only
            affects the specific data file shown.
          </div>
          {RESET_OPTIONS.map((opt) => (
            <div
              key={opt.target}
              className="rounded-[10px] bg-bg-elevated border border-border p-4 flex items-start gap-3"
            >
              <span className="text-2xl flex-shrink-0">{opt.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-sm">
                  {opt.label}
                </div>
                <div className="text-xs text-fg-muted mt-1">
                  {opt.description}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-danger btn-small flex-shrink-0"
                onClick={() => setPendingReset(opt.target)}
                disabled={resetting !== null}
              >
                {resetting === opt.target ? "Resetting…" : "Reset"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingReset}
        danger
        title={`Reset ${pending?.label ?? ""}?`}
        message={
          pending
            ? `${pending.description} This action cannot be undone.`
            : ""
        }
        confirmLabel={
          resetting === pendingReset ? "Resetting…" : `Reset ${pending?.label ?? ""}`
        }
        onCancel={() => resetting === null && setPendingReset(null)}
        onConfirm={() => pendingReset && performReset(pendingReset)}
      />
    </div>
  );
}
