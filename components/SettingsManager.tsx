"use client";

import { useMemo, useState } from "react";
import type { Player, PotLedgerEntry } from "@/lib/types";
import type { Settings } from "@/lib/settings";
import { formatDollar } from "@/lib/calc";
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
  players,
  initialPotEntries,
}: {
  initialSettings: Settings;
  players: Player[];
  initialPotEntries: PotLedgerEntry[];
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
  const [confirmClearCache, setConfirmClearCache] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  // --- Initialize Pot Balances state ---
  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  );
  const initialPotMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of initialPotEntries) {
      map[e.name.trim().toLowerCase()] = String(Math.round(e.amount));
    }
    return map;
  }, [initialPotEntries]);
  const [potAmounts, setPotAmounts] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const p of players) {
      seed[p.name.trim().toLowerCase()] = initialPotMap[p.name.trim().toLowerCase()] ?? "";
    }
    return seed;
  });
  const [savingPot, setSavingPot] = useState(false);
  const [confirmInitPot, setConfirmInitPot] = useState(false);

  const potTotals = useMemo(() => {
    let owed = 0;
    let receivable = 0;
    for (const p of sortedPlayers) {
      const v = Number(potAmounts[p.name.trim().toLowerCase()]);
      if (!Number.isFinite(v)) continue;
      if (v > 0) owed += v;
      else if (v < 0) receivable += Math.abs(v);
    }
    return { owed, receivable, net: owed - receivable };
  }, [sortedPlayers, potAmounts]);

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

  async function initializePot() {
    setSavingPot(true);
    try {
      const entries = sortedPlayers
        .map((p) => {
          const raw = potAmounts[p.name.trim().toLowerCase()];
          const amt = Number(raw);
          return { name: p.name, amount: Number.isFinite(amt) ? amt : 0 };
        })
        .filter((e) => Math.abs(e.amount) >= 0.01);
      const res = await fetch("/api/admin/pot/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        entries?: PotLedgerEntry[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Initialize failed");
      toast(`Pot initialized for ${entries.length} player${entries.length === 1 ? "" : "s"} ✓`, "success");
      refreshAfterSuccess();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Initialize failed", "error");
    } finally {
      setSavingPot(false);
      setConfirmInitPot(false);
    }
  }

  function setPotAmount(playerKey: string, value: string) {
    setPotAmounts((prev) => ({ ...prev, [playerKey]: value }));
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

  async function clearBrowserCache() {
    setClearingCache(true);
    try {
      if (typeof window !== "undefined") {
        const localKeys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && (key.startsWith("chip-kings") || key.startsWith("ck:"))) {
            localKeys.push(key);
          }
        }
        for (const key of localKeys) window.localStorage.removeItem(key);
        window.sessionStorage.clear();
      }

      if (typeof caches !== "undefined") {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }

      toast("Browser cache cleared ✓", "success");
      refreshAfterSuccess();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Clear cache failed", "error");
    } finally {
      setClearingCache(false);
      setConfirmClearCache(false);
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
            🏦 Initialize Pot Balances
          </h2>
        </div>
        <div className="card-body space-y-4">
          <div className="text-xs text-fg-muted">
            Set each player&apos;s starting pot balance.{" "}
            <strong className="text-fg">Positive</strong> = pot owes the player
            (they receive from pot).{" "}
            <strong className="text-fg">Negative</strong> = player owes the pot.
            Saving replaces the entire pot ledger; players left blank or set to
            zero are removed.
          </div>

          {sortedPlayers.length === 0 ? (
            <div className="text-center py-6 text-fg-dim text-sm">
              No players in the roster yet. Add players first.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sortedPlayers.map((p) => {
                  const key = p.name.trim().toLowerCase();
                  const current = Number(initialPotMap[key] ?? 0);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-bg-elevated border border-border"
                    >
                      <strong className="font-semibold flex-1 truncate">
                        {p.name}
                      </strong>
                      {Math.abs(current) >= 0.01 && (
                        <span
                          className={`text-[11px] font-mono ${
                            current > 0 ? "text-success" : "text-danger"
                          }`}
                          title="Current ledger value"
                        >
                          now {current > 0 ? "+" : "−"}$
                          {formatDollar(Math.abs(current))}
                        </span>
                      )}
                      <input
                        type="number"
                        step="1"
                        inputMode="numeric"
                        placeholder="0"
                        value={potAmounts[key] ?? ""}
                        onChange={(e) => setPotAmount(key, e.target.value)}
                        className="input !w-28 text-right font-mono"
                        aria-label={`Pot balance for ${p.name}`}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="stat">
                  <div className="stat-label">Pot Owes</div>
                  <div className="stat-value text-success">
                    ${formatDollar(potTotals.owed)}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Owed to Pot</div>
                  <div className="stat-value text-danger">
                    ${formatDollar(potTotals.receivable)}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Net</div>
                  <div
                    className={`stat-value ${
                      potTotals.net >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {potTotals.net >= 0 ? "+" : "−"}$
                    {formatDollar(Math.abs(potTotals.net))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const cleared: Record<string, string> = {};
                    for (const p of sortedPlayers) {
                      cleared[p.name.trim().toLowerCase()] = "";
                    }
                    setPotAmounts(cleared);
                  }}
                  disabled={savingPot}
                >
                  Clear Form
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setConfirmInitPot(true)}
                  disabled={savingPot}
                >
                  {savingPot ? "Applying…" : "Apply Balances"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            🧽 Clear Cache
          </h2>
        </div>
        <div className="card-body">
          <div className="rounded-[10px] bg-bg-elevated border border-border p-4 flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">🧽</span>
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-sm">
                Browser cache and local state
              </div>
              <div className="text-xs text-fg-muted mt-1">
                Clears this browser&apos;s saved draft, view preferences,
                legacy paid-check caches, theme preference, session storage,
                and Cache Storage. Server data is not changed.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-small flex-shrink-0"
              onClick={() => setConfirmClearCache(true)}
              disabled={clearingCache}
            >
              {clearingCache ? "Clearing…" : "Clear Cache"}
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
        open={confirmInitPot}
        title="Apply pot balances?"
        message="This replaces the entire pot ledger with the values shown above. Anyone not listed (or set to zero) will be removed. This cannot be undone."
        confirmLabel={savingPot ? "Applying…" : "Apply"}
        onCancel={() => !savingPot && setConfirmInitPot(false)}
        onConfirm={() => initializePot()}
      />

      <ConfirmDialog
        open={confirmClearCache}
        title="Clear browser cache?"
        message="This clears only browser-local Chip Kings cache and preferences on this device. Saved games, reconciliations, players, settings, and pot balances are not deleted."
        confirmLabel={clearingCache ? "Clearing…" : "Clear Cache"}
        onCancel={() => !clearingCache && setConfirmClearCache(false)}
        onConfirm={clearBrowserCache}
      />

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
