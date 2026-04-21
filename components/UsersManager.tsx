"use client";

import { useState } from "react";
import { ROLES, type PublicUser, type Role } from "@/lib/types";
import { toast } from "./Toaster";

type Props = {
  initialUsers: PublicUser[];
  currentUserId: string;
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_DESC: Record<Role, string> = {
  admin: "Manage users, save and view reports",
  editor: "Save, view, and delete reports",
  viewer: "View reports only",
};

export function UsersManager({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<PublicUser[]>(initialUsers);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const data = (await res.json()) as { user?: PublicUser; error?: string };
      if (!res.ok) throw new Error(data.error || "Create failed");
      setUsers((prev) => [...prev, data.user!]);
      setUsername("");
      setPassword("");
      setRole("viewer");
      toast(`Created ${data.user!.username}`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Create failed", "error");
    } finally {
      setCreating(false);
    }
  }

  async function updateUser(id: string, patch: Partial<{ role: Role; password: string; username: string }>) {
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { user?: PublicUser; error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed");
      setUsers((prev) => prev.map((u) => (u.id === id ? data.user! : u)));
      toast("Updated", "success");
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
      return false;
    }
  }

  async function deleteUser(id: string) {
    if (!confirm("Delete this user permanently?")) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast("Deleted", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

  return (
    <div className="space-y-4">
      {/* Create user */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold">👤 Create user</h2>
        </div>
        <form onSubmit={createUser} className="card-body space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="new-username">Username</label>
              <input
                id="new-username"
                className="input"
                autoComplete="off"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-password">Password</label>
              <input
                id="new-password"
                type="password"
                className="input"
                autoComplete="new-password"
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="new-role">Role</label>
              <select
                id="new-role"
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-fg-dim">{ROLE_DESC[role]}</p>
          <button type="submit" className="btn" disabled={creating}>
            {creating ? "Creating…" : "Create user"}
          </button>
        </form>
      </div>

      {/* User list */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-display text-[15px] font-semibold">👥 Users ({users.length})</h2>
        </div>
        <div className="card-body space-y-2">
          {users.length === 0 ? (
            <div className="text-center py-8 text-fg-dim text-sm">No users yet.</div>
          ) : (
            users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === currentUserId}
                isEditing={editingId === u.id}
                onStartEdit={() => setEditingId(u.id)}
                onCancelEdit={() => setEditingId(null)}
                onUpdate={async (patch) => {
                  const ok = await updateUser(u.id, patch);
                  if (ok) setEditingId(null);
                }}
                onDelete={() => deleteUser(u.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: {
  user: PublicUser;
  isSelf: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (patch: { role?: Role; password?: string }) => void | Promise<void>;
  onDelete: () => void;
}) {
  const [role, setRole] = useState<Role>(user.role);
  const [password, setPassword] = useState("");

  function save() {
    const patch: { role?: Role; password?: string } = {};
    if (role !== user.role) patch.role = role;
    if (password) patch.password = password;
    if (Object.keys(patch).length === 0) {
      onCancelEdit();
      return;
    }
    onUpdate(patch);
    setPassword("");
  }

  return (
    <div className="rounded-[10px] border border-border bg-bg-elevated">
      <div className="flex justify-between items-center gap-3 p-3.5">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] flex items-center gap-2">
            <span>👤</span>
            <span className="truncate">{user.username}</span>
            {isSelf && (
              <span className="text-[10px] uppercase tracking-wider text-fg-dim font-mono">
                (you)
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-fg-muted font-mono mt-1">
            <span className={`chip ${roleChipClass(user.role)}`}>{ROLE_LABEL[user.role]}</span>
            <span className="chip chip-neutral">
              joined {new Date(user.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {!isEditing && (
            <button className="btn btn-secondary btn-small" onClick={onStartEdit}>
              Edit
            </button>
          )}
          <button
            className="btn btn-danger btn-small"
            onClick={onDelete}
            disabled={isSelf}
            title={isSelf ? "Cannot delete yourself" : "Delete user"}
          >
            Delete
          </button>
        </div>
      </div>

      {isEditing && (
        <div className="border-t border-border p-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor={`role-${user.id}`}>Role</label>
              <select
                id={`role-${user.id}`}
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={isSelf}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {isSelf && (
                <p className="text-[11px] text-fg-dim mt-1">
                  You cannot change your own role.
                </p>
              )}
            </div>
            <div>
              <label className="label" htmlFor={`pw-${user.id}`}>
                New password <span className="text-fg-dim normal-case">(leave blank to keep)</span>
              </label>
              <input
                id={`pw-${user.id}`}
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={save}>Save</button>
            <button className="btn btn-secondary" onClick={onCancelEdit}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function roleChipClass(role: Role): string {
  if (role === "admin") return "chip-loss";
  if (role === "editor") return "chip-win";
  return "chip-neutral";
}
