"use client";

import { useEffect, useRef, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { calculatePayments, isPot, sumPlayerExpenses } from "@/lib/calc";
import type { CalculationResult, Person, Role } from "@/lib/types";
import { PlayerRow } from "./PlayerRow";
import { ResultsView } from "./ResultsView";
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

type Props = { role: Role | null; playerNames: string[] };

export function Calculator({ role, playerNames }: Props) {
  const isAuthenticated = role !== null;
  const canWrite = role === "admin" || role === "editor";
  const [people, setPeople] = useState<Person[]>([]);
  const [gameDate, setGameDate] = useState<string>(todayIso());
  const [place, setPlace] = useState<string>("");
  const [name, setName] = useState("");
  const [chipsTaken, setChipsTaken] = useState(String(DEFAULT_CHIPS_TAKEN));
  const [chipsLeft, setChipsLeft] = useState("");
  const [expenses, setExpenses] = useState("");
  const [potAmount, setPotAmount] = useState("");
  const [editingIndex, setEditingIndex] = useState(-1);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [inputsCollapsed, setInputsCollapsed] = useState(false);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);

  const nameSelectRef = useRef<HTMLSelectElement>(null);
  const chipsTakenRef = useRef<HTMLInputElement>(null);
  const chipsLeftRef = useRef<HTMLInputElement>(null);
  const expensesRef = useRef<HTMLInputElement>(null);
  const potAmountRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage draft
  useEffect(() => {
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
  }, []);

  // Persist draft
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ people, gameDate, place }));
    } catch {}
  }, [people, gameDate, place]);

  const potExpensesTotal = sumPlayerExpenses(people);

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
    setResult(null);
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
    setResult(null);
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
    setResult(null);
  }

  function clearAll() {
    if (!confirm("Clear all players and reset?")) return;
    setPeople([]);
    resetForm();
    setResult(null);
    setPotAmount("");
    setPlace("");
    setGameDate(todayIso());
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  function calculate() {
    if (people.length < 2) {
      toast("Add at least 2 players", "error");
      return;
    }
    const r = calculatePayments(people);
    if (!r) return;
    setResult(r);
    setInputsCollapsed(true);
  }

  async function saveToReports() {
    if (!result) return;
    if (!isAuthenticated) {
      toast("Sign in to save reports", "error");
      window.location.href = "/login?next=/";
      return;
    }
    if (!canWrite) {
      toast("Viewers cannot save reports", "error");
      return;
    }
    const parsedDate = new Date(gameDate);
    const datePart = Number.isNaN(parsedDate.getTime())
      ? new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : parsedDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
    const placePart = place.trim() ? ` @ ${place.trim()}` : "";
    const defaultTitle = `Game ${datePart}${placePart}`;
    const title = prompt("Name this game:", defaultTitle);
    if (title === null) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || defaultTitle, snapshot: result }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Save failed (${res.status})`);
      }
      toast("Report saved ✓", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Players card */}
      <div className="card">
        <button
          type="button"
          className="card-header w-full cursor-pointer"
          onClick={() => setInputsCollapsed((v) => !v)}
        >
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            <span
              className={`text-fg-dim text-xs transition-transform ${
                inputsCollapsed ? "-rotate-90" : ""
              }`}
            >
              ▾
            </span>
            Players
          </h2>
        </button>
        {!inputsCollapsed && (
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
                <input
                  id="chips-taken"
                  ref={chipsTakenRef}
                  className="input"
                  type="number"
                  step="50"
                  min="0"
                  inputMode="numeric"
                  value={chipsTaken}
                  onChange={(e) => setChipsTaken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      chipsLeftRef.current?.focus();
                    }
                  }}
                />
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

            {/* People list */}
            <div className="flex flex-col gap-2">
              {people.length === 0 ? (
                <div className="text-center py-8 text-fg-dim text-sm">
                  <span className="block text-3xl mb-2">👥</span>
                  No players yet. Add someone above.
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
              <button type="button" className="btn flex-1" onClick={calculate}>
                Calculate Payments
              </button>
              <button type="button" className="btn btn-secondary" onClick={clearAll}>
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results card */}
      <div className="card">
        <button
          type="button"
          className="card-header w-full cursor-pointer"
          onClick={() => setResultsCollapsed((v) => !v)}
        >
          <h2 className="font-display text-[15px] font-semibold flex items-center gap-2.5">
            <span
              className={`text-fg-dim text-xs transition-transform ${
                resultsCollapsed ? "-rotate-90" : ""
              }`}
            >
              ▾
            </span>
            Results
          </h2>
        </button>
        {!resultsCollapsed && (
          <div className="card-body">
            {result ? (
              <div className="space-y-4">
                <ResultsView result={result} />
                {isAuthenticated && !canWrite ? (
                  <div className="text-center text-xs text-fg-dim py-2">
                    🔒 Viewers cannot save reports
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn w-full"
                    onClick={saveToReports}
                    disabled={saving}
                  >
                    {saving
                      ? "Saving…"
                      : isAuthenticated
                      ? "💾 Save to Games"
                      : "🔒 Sign in to save to Games"}
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-10 text-fg-dim text-sm">
                <span className="block text-3xl mb-2">🎲</span>
                Add players and calculate to see settlements
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
