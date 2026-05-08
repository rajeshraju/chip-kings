"use client";

import { useEffect, useState } from "react";
import type { Player } from "@/lib/types";
import { toast } from "./Toaster";
import { ViewToggle, type AdminView } from "./ViewToggle";
import { ConfirmDialog } from "./ConfirmDialog";
import { PencilIcon, XIcon } from "./icons";
import { refreshAfterSuccess } from "@/lib/refresh";
import { formatAppDate } from "@/lib/dates";

type Props = {
  initialPlayers: Player[];
};

const VIEW_KEY = "ck:admin:players-view";

export function PlayersManager({ initialPlayers }: Props) {
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<AdminView>("cards");
  const [pendingDelete, setPendingDelete] = useState<Player | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "cards" || saved === "list") setView(saved);
    } catch {}
  }, []);

  function changeView(v: AdminView) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { player?: Player; error?: string };
      if (!res.ok) throw new Error(data.error || "Create failed");
      setPlayers((prev) =>
        [...prev, data.player!].sort((a, b) => a.name.localeCompare(b.name))
      );
      setName("");
      toast(`Added ${data.player!.name}`, "success");
      refreshAfterSuccess();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Create failed", "error");
    } finally {
      setCreating(false);
    }
  }

  async function updatePlayer(id: string, patch: { name?: string }) {
    try {
      const res = await fetch(`/api/players/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { player?: Player; error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed");
      setPlayers((prev) =>
        prev
          .map((p) => (p.id === id ? data.player! : p))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      toast("Updated", "success");
      refreshAfterSuccess();
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
      return false;
    }
  }

  async function deletePlayer(id: string) {
    try {
      const res = await fetch(`/api/players/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setPlayers((prev) => prev.filter((p) => p.id !== id));
      toast("Deleted", "success");
      refreshAfterSuccess();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold">🎲 Add player</h2>
        </div>
        <form onSubmit={createPlayer} className="card-body space-y-4">
          <div>
            <label className="label" htmlFor="new-player-name">Name</label>
            <input
              id="new-player-name"
              className="input"
              autoComplete="off"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Srikanth"
            />
          </div>
          <button type="submit" className="btn" disabled={creating}>
            {creating ? "Adding…" : "Add player"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold">
            👥 Roster ({players.length})
          </h2>
          <ViewToggle value={view} onChange={changeView} />
        </div>
        <div className="card-body">
          {players.length === 0 ? (
            <div className="text-center py-8 text-fg-dim text-sm">
              No players yet.
            </div>
          ) : view === "cards" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {players.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  isEditing={editingId === p.id}
                  onStartEdit={() => setEditingId(p.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onUpdate={async (patch) => {
                    const ok = await updatePlayer(p.id, patch);
                    if (ok) setEditingId(null);
                  }}
                  onDelete={() => setPendingDelete(p)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {players.map((p) => (
                <PlayerRosterRow
                  key={p.id}
                  player={p}
                  isEditing={editingId === p.id}
                  onStartEdit={() => setEditingId(p.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onUpdate={async (patch) => {
                    const ok = await updatePlayer(p.id, patch);
                    if (ok) setEditingId(null);
                  }}
                  onDelete={() => setPendingDelete(p)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        danger
        title="Delete player?"
        message="This removes them from the roster. Existing game reports are not affected."
        itemName={pendingDelete?.name}
        confirmLabel="Delete player"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deletePlayer(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

type PlayerItemProps = {
  player: Player;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (patch: { name?: string }) => void | Promise<void>;
  onDelete: () => void;
};

function PlayerEditFields({
  player,
  onSave,
  onCancel,
}: {
  player: Player;
  onSave: (patch: { name?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(player.name);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === player.name) {
      onCancel();
      return;
    }
    onSave({ name: trimmed });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor={`name-${player.id}`}>Name</label>
        <input
          id={`name-${player.id}`}
          className="input"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button className="btn" onClick={save}>Save</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PlayerCard({
  player,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: PlayerItemProps) {
  return (
    <div
      className={`rounded-[10px] border border-border bg-bg-elevated p-2.5 flex flex-col ${
        isEditing ? "" : "aspect-square"
      }`}
    >
      <div className="flex flex-col items-center text-center flex-1 justify-center gap-1.5 min-h-0">
        <div className="w-10 h-10 rounded-full bg-bg-card border border-border grid place-items-center text-base">
          🎲
        </div>
        <div className="font-semibold text-[13px] truncate w-full leading-tight">
          {player.name}
        </div>
      </div>
      <div className="flex gap-1 justify-center mt-2 pt-2 border-t border-border">
        {!isEditing && (
          <IconBtn label="Edit player" onClick={onStartEdit}>
            <PencilIcon className="w-4 h-4" />
          </IconBtn>
        )}
        <IconBtn label="Delete player" onClick={onDelete} danger>
          <XIcon className="w-4 h-4" />
        </IconBtn>
      </div>
      {isEditing && (
        <div className="border-t border-border pt-3 mt-3">
          <PlayerEditFields
            player={player}
            onSave={onUpdate}
            onCancel={onCancelEdit}
          />
        </div>
      )}
    </div>
  );
}

function PlayerRosterRow({
  player,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: PlayerItemProps) {
  return (
    <div className="rounded-[10px] border border-border bg-bg-elevated">
      <div className="flex justify-between items-center gap-3 p-3.5">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] flex items-center gap-2">
            <span>🎲</span>
            <span className="truncate">{player.name}</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-fg-muted font-mono mt-1">
            <span className="chip chip-neutral">
              added {formatAppDate(player.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {!isEditing && (
            <IconBtn label="Edit player" onClick={onStartEdit}>
              <PencilIcon className="w-4 h-4" />
            </IconBtn>
          )}
          <IconBtn label="Delete player" onClick={onDelete} danger>
            <XIcon className="w-4 h-4" />
          </IconBtn>
        </div>
      </div>
      {isEditing && (
        <div className="border-t border-border p-3.5">
          <PlayerEditFields
            player={player}
            onSave={onUpdate}
            onCancel={onCancelEdit}
          />
        </div>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-9 grid place-items-center rounded-[12px] text-white shadow-[0_2px_0_rgba(0,0,0,0.15),0_4px_10px_rgba(0,0,0,0.2)] ring-1 ring-inset ring-white/25 transition-all active:translate-y-px active:shadow-[0_1px_0_rgba(0,0,0,0.15),0_2px_4px_rgba(0,0,0,0.2)] disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? "bg-red-500 hover:bg-red-600"
          : "bg-emerald-500 hover:bg-emerald-600"
      }`}
    >
      {children}
    </button>
  );
}
