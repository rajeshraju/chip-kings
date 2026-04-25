"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { formatDollar, isPot, netForPerson, sumPlayerExpenses } from "@/lib/calc";
import type { CalculationResult, Person, Report, Role } from "@/lib/types";
import { PlayerRow } from "./PlayerRow";
import { toast } from "./Toaster";

function parseIsoDate(s: string): Date | null {
  const parts = s.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DRAFT_KEY = "chip-kings-draft";
const DEFAULT_CHIPS_TAKEN = 250;

const todayIso = () => new Date().toISOString().slice(0, 10);

type Props = {
  role: Role | null;
  playerNames: string[];
  editingReport?: Report | null;
};

function parseTitlePlace(title: string): string {
  const match = title.match(/ @ (.+)$/);
  return match ? match[1].trim() : "";
}

export function Calculator({ role, playerNames, editingReport }: Props) {
  const isAuthenticated = role !== null;
  const canWrite = role === "admin" || role === "editor";
  const isEditing = !!editingReport;
  const [people, setPeople] = useState<Person[]>(
    editingReport ? editingReport.snapshot.people : []
  );
  const [gameDate, setGameDate] = useState<string>(
    editingReport ? editingReport.createdAt.slice(0, 10) : todayIso()
  );
  const [place, setPlace] = useState<string>(
    editingReport ? parseTitlePlace(editingReport.title) : ""
  );
  const [name, setName] = useState("");
  const [chipsTaken, setChipsTaken] = useState(String(DEFAULT_CHIPS_TAKEN));
  const [chipsLeft, setChipsLeft] = useState("");
  const [expenses, setExpenses] = useState("");
  const [potAmount, setPotAmount] = useState("");
  const [editingIndex, setEditingIndex] = useState(-1);
  const [saving, setSaving] = useState(false);

  const nameSelectRef = useRef<HTMLSelectElement>(null);
  const chipsTakenRef = useRef<HTMLInputElement>(null);
  const chipsLeftRef = useRef<HTMLInputElement>(null);
  const expensesRef = useRef<HTMLInputElement>(null);
  const potAmountRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage draft (skipped in edit mode — report state is authoritative)
  useEffect(() => {
    if (isEditing) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setPeople(parsed);
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.people)) setPeople(parsed.people);
        if (typeof parsed.gameDate === "string") setGameDate(parsed.gameDate);
        if (typeof parsed.place === "string") setPlace(parsed.place);
      }
    } catch {}
  }, [isEditing]);

  // Persist draft (only in new-game mode)
  useEffect(() => {
    if (isEditing) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ people, gameDate, place }));
    } catch {}
  }, [people, gameDate, place, isEditing]);

  const potExpensesTotal = sumPlayerExpenses(people);

  const totalNet = useMemo(
    () => people.reduce((s, p) => s + netForPerson(p), 0),
    [people]
  );
  const isBalanced = Math.abs(totalNet) < 0.01;

  // Keep POT expenses in sync
  useEffect(() => {
    const potIdx = people.findIndex((p) => isPot(p.name));
    if (potIdx !== -1 && people[potIdx].expenses !== potExpensesTotal) {
      setPeople((prev) =>
        prev.map((p, i) => (i === potIdx ? { ...p, expenses: potExpensesTotal } : p))
      );
    }
  }, [potExpensesTotal, people]);

  function resetForm() {
    setName("");
    setChipsTaken(String(DEFAULT_CHIPS_TAKEN));
    setChipsLeft("");
    setExpenses("");
    setEditingIndex(-1);
  }

  function addPerson() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Pick a player", "error");
      nameSelectRef.current?.focus();
      return;
    }
    const taken = chipsTaken.trim() === "" ? NaN : parseFloat(chipsTaken);
    if (Number.isNaN(taken) || taken < 0) {
      toast("Invalid chips taken", "error");
      chipsTakenRef.current?.focus();
      return;
    }
    const left = chipsLeft.trim() === "" ? NaN : parseFloat(chipsLeft);
    if (Number.isNaN(left) || left < 0) {
      toast("Invalid chips left", "error");
      chipsLeftRef.current?.focus();
      return;
    }
    const earn = left - taken;
    const exp = expenses.trim() === "" ? 0 : parseFloat(expenses);
    if (expenses.trim() !== "" && (Number.isNaN(exp) || exp < 0)) {
      toast("Expenses must be ≥ 0", "error");
      expensesRef.current?.focus();
      return;
    }

    setPeople((prev) => {
      const next = { name: trimmed, earnings: earn, expenses: exp, chipsTaken: taken };
      if (editingIndex !== -1) {
        return prev.map((p, i) => (i === editingIndex ? next : p));
      }
      const existing = prev.findIndex(
        (p) => p.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing !== -1) {
        return prev.map((p, i) => (i === existing ? next : p));
      }
      return [...prev, next];
    });

    resetForm();
    nameSelectRef.current?.focus();
  }

  function addPot() {
    const amt = potAmount.trim() === "" ? NaN : parseFloat(potAmount);
    if (Number.isNaN(amt)) {
      toast("Enter a valid POT amount", "error");
      potAmountRef.current?.focus();
      return;
    }
    setPeople((prev) => {
      const idx = prev.findIndex((p) => isPot(p.name));
      if (idx !== -1) {
        return prev.map((p, i) =>
          i === idx ? { ...p, earnings: amt, expenses: potExpensesTotal } : p
        );
      }
      return [...prev, { name: "POT", earnings: amt, expenses: potExpensesTotal }];
    });
    setPotAmount("");
    potAmountRef.current?.focus();
  }

  function editPerson(i: number) {
    const p = people[i];
    if (isPot(p.name)) {
      setPotAmount(String(p.earnings ?? ""));
      potAmountRef.current?.focus();
      return;
    }
    setName(p.name);
    const taken = Number(p.chipsTaken ?? DEFAULT_CHIPS_TAKEN);
    setChipsTaken(String(taken));
    setChipsLeft(String(taken + (Number(p.earnings) || 0)));
    setExpenses(p.expenses === 0 ? "" : String(p.expenses));
    setEditingIndex(i);
    chipsLeftRef.current?.focus();
  }

  function removePerson(i: number) {
    if (editingIndex === i) resetForm();
    setPeople((prev) => prev.filter((_, idx) => idx !== i));
  }

  function clearAll() {
    if (!confirm("Clear all players and reset?")) return;
    setPeople([]);
    resetForm();
    setPotAmount("");
    setPlace("");
    setGameDate(todayIso());
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  async function saveGame() {
    if (people.length < 2) {
      toast("Add at least 2 players", "error");
      return;
    }
    if (!isAuthenticated) {
      toast("Sign in to save games", "error");
      window.location.href = "/login?next=/";
      return;
    }
    if (!canWrite) {
      toast("Viewers cannot save games", "error");
      return;
    }

    // Auto-balance via POT: choose POT.earnings so player nets cancel.
    // (POT.expenses is auto-synced to sumPlayerExpenses, so it cancels out
    //  in totalNet; we only need to set POT.earnings = -sum(player.earnings).)
    let workingPeople = people;
    const playerEarningsSum = people
      .filter((p) => !isPot(p.name))
      .reduce((s, p) => s + (Number(p.earnings) || 0), 0);
    const targetPotEarnings = -playerEarningsSum;
    const potIdx = people.findIndex((p) => isPot(p.name));
    const oldPotEarnings = potIdx === -1 ? 0 : Number(people[potIdx].earnings) || 0;
    const diff = targetPotEarnings - oldPotEarnings;

    if (Math.abs(diff) >= 0.01) {
      if (potIdx === -1) {
        workingPeople = [
          ...people,
          { name: "POT", earnings: targetPotEarnings, expenses: potExpensesTotal },
        ];
      } else {
        workingPeople = people.map((p, i) =>
          i === potIdx ? { ...p, earnings: targetPotEarnings } : p
        );
      }
      setPeople(workingPeople);
      toast(
        `POT adjusted by ${diff >= 0 ? "+" : "−"}$${formatDollar(
          Math.abs(diff)
        )} to balance`,
        "success"
      );
    }

    const pot = workingPeople.find((p) => isPot(p.name));
    const potEarnings = pot ? Number(pot.earnings) || 0 : 0;
    const potExpenses = pot ? Number(pot.expenses) || 0 : 0;
    const snapshot: CalculationResult = {
      totalNet: 0,
      transactions: [],
      potBalance: potEarnings - potExpenses,
      potExpenses,
      potEarnings,
      hasPot: !!pot,
      playerCount: workingPeople.filter((p) => !isPot(p.name)).length,
      people: JSON.parse(JSON.stringify(workingPeople)),
    };

    const parsedDate = new Date(gameDate);
    const datePart = Number.isNaN(parsedDate.getTime())
      ? new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : parsedDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
    const placePart = place.trim() ? ` @ ${place.trim()}` : "";
    const defaultTitle =
      isEditing && editingReport ? editingReport.title : `Game ${datePart}${placePart}`;
    const title = prompt(
      isEditing ? "Update game name:" : "Name this game:",
      defaultTitle
    );
    if (title === null) return;
    setSaving(true);
    try {
      const url = isEditing && editingReport
        ? `/api/reports/${editingReport.id}`
        : "/api/reports";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || defaultTitle, snapshot }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Save failed (${res.status})`);
      }
      toast(isEditing ? "Game updated ✓" : "Game saved ✓", "success");
      if (isEditing) {
        window.location.href = "/reports";
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {isEditing && editingReport && (
        <div className="alert alert-warning flex items-center justify-between gap-3">
          <span>
            ✏️ Editing <strong>{editingReport.title}</strong>
          </span>
          <a href="/reports" className="btn btn-ghost btn-small">
            Cancel
          </a>
        </div>
      )}
      {/* Game details row */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            🎯 Game Details
          </h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="label" htmlFor="game-date">Date</label>
              <DatePicker
                id="game-date"
                selected={parseIsoDate(gameDate)}
                onChange={(d) => d && setGameDate(formatIsoDate(d))}
                dateFormat="MMM d, yyyy"
                className="input"
                wrapperClassName="w-full"
                popperPlacement="bottom-start"
                showPopperArrow={false}
                todayButton="Today"
              />
            </div>
            <div>
              <label className="label" htmlFor="place">Place</label>
              <input
                id="place"
                className="input"
                placeholder="e.g. Rajesh's house"
                autoComplete="off"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="pot-amount">💰 POT Amount</label>
              <input
                id="pot-amount"
                ref={potAmountRef}
                className="input"
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="Winnings/Losses"
                value={potAmount}
                onChange={(e) => setPotAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPot();
                  }
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor="pot-expenses">POT Expenses (auto)</label>
              <input
                id="pot-expenses"
                className="input"
                type="number"
                readOnly
                value={potExpensesTotal.toFixed(2)}
              />
            </div>
            <button type="button" className="btn btn-success w-full" onClick={addPot}>
              Add / Update POT
            </button>
          </div>
          <div
            className={`mt-4 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[10px] border ${
              isBalanced
                ? "bg-success/10 border-success/30 text-success"
                : "bg-danger/10 border-danger/30 text-danger"
            }`}
          >
            <span className="font-display font-semibold text-sm">
              {people.length === 0
                ? "Balance"
                : isBalanced
                ? "✓ Balanced"
                : "⚠ Off-balance"}
            </span>
            <span className="font-mono font-semibold">
              {totalNet >= 0 ? "+" : "−"}${formatDollar(Math.abs(totalNet))}
            </span>
          </div>
        </div>
      </div>

      {/* Entry + Players list (split 50/50 on desktop, stacked on mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Entry card */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            ➕ Add Player
          </h2>
        </div>
        <div className="card-body space-y-4">
          <div>
            <label className="label" htmlFor="player-select">Player</label>
            <select
              id="player-select"
              ref={nameSelectRef}
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value) chipsLeftRef.current?.focus();
              }}
            >
              <option value="">Choose a player…</option>
              {playerNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="chips-taken">Chips Taken</label>
              <div className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  aria-label="Decrease chips taken"
                  className="input !w-11 !px-0 !py-0 grid place-items-center text-lg font-semibold select-none"
                  onClick={() => {
                    const cur = parseFloat(chipsTaken);
                    const base = Number.isNaN(cur) ? DEFAULT_CHIPS_TAKEN : cur;
                    setChipsTaken(String(Math.max(0, base - 50)));
                  }}
                >
                  −
                </button>
                <input
                  id="chips-taken"
                  ref={chipsTakenRef}
                  className="input text-center flex-1 min-w-0"
                  type="text"
                  inputMode="none"
                  readOnly
                  value={chipsTaken}
                />
                <button
                  type="button"
                  aria-label="Increase chips taken"
                  className="input !w-11 !px-0 !py-0 grid place-items-center text-lg font-semibold select-none"
                  onClick={() => {
                    const cur = parseFloat(chipsTaken);
                    const base = Number.isNaN(cur) ? DEFAULT_CHIPS_TAKEN : cur;
                    setChipsTaken(String(base + 50));
                  }}
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="chips-left">Chips Left</label>
              <input
                id="chips-left"
                ref={chipsLeftRef}
                className="input"
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                placeholder="Final chip count"
                value={chipsLeft}
                onChange={(e) => setChipsLeft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    expensesRef.current?.focus();
                  }
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor="expenses">Expenses</label>
              <input
                id="expenses"
                ref={expensesRef}
                className="input"
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="Optional"
                value={expenses}
                onChange={(e) => setExpenses(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPerson();
                  }
                }}
              />
            </div>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <button type="button" className="btn" onClick={addPerson}>
              {editingIndex !== -1 ? "Edit" : "Add"}
            </button>
            {editingIndex !== -1 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Players list card */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            👥 Players
            <span className="text-xs text-fg-dim font-mono">({people.length})</span>
          </h2>
        </div>
        <div className="card-body space-y-4">
          <div className="flex flex-col gap-2">
            {people.length === 0 ? (
              <div className="text-center py-8 text-fg-dim text-sm">
                <span className="block text-3xl mb-2">👥</span>
                No players yet. Add someone using the form.
              </div>
            ) : (
              people.map((p, i) => (
                <PlayerRow
                  key={`${p.name}-${i}`}
                  person={p}
                  index={i}
                  onEdit={editPerson}
                  onRemove={removePerson}
                />
              ))
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              className="btn flex-1"
              onClick={saveGame}
              disabled={saving}
            >
              {saving
                ? isEditing
                  ? "Updating…"
                  : "Saving…"
                : isEditing
                ? "Update Game"
                : "Save Game"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={clearAll}>
              Clear All
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
