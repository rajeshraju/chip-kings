"use client";

import { useEffect, useState } from "react";
import { ROLES, type PublicUser, type Role } from "@/lib/types";
import { toast } from "./Toaster";
import { ViewToggle, type AdminView } from "./ViewToggle";
import { ConfirmDialog } from "./ConfirmDialog";
import { PencilIcon, XIcon } from "./icons";
import { refreshAfterSuccess } from "@/lib/refresh";

type Props = {
  initialUsers: PublicUser[];
  currentUserId: string;
};

const VIEW_KEY = "ck:admin:users-view";

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
  const [view, setView] = useState<AdminView>("cards");
  const [pendingDelete, setPendingDelete] = useState<PublicUser | null>(null);

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
      refreshAfterSuccess();
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
      refreshAfterSuccess();
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
      return false;
    }
  }

  async function deleteUser(id: string) {
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast("Deleted", "success");
      refreshAfterSuccess();
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
          <h2 className="font-display text-[15px] font-semibold">
            👥 Users ({users.length})
          </h2>
          <ViewToggle value={view} onChange={changeView} />
        </div>
        <div className="card-body">
          {users.length === 0 ? (
            <div className="text-center py-8 text-fg-dim text-sm">No users yet.</div>
          ) : view === "cards" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {users.map((u) => (
                <UserCard
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
                  onDelete={() => setPendingDelete(u)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {users.map((u) => (
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
                  onDelete={() => setPendingDelete(u)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        danger
        title="Delete user?"
        message="This action cannot be undone. The user will immediately lose access."
        itemName={pendingDelete?.username}
        confirmLabel="Delete user"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteUser(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

type UserItemProps = {
  user: PublicUser;
  isSelf: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (patch: { role?: Role; password?: string }) => void | Promise<void>;
  onDelete: () => void;
};

function UserEditFields({
  user,
  isSelf,
  onSave,
  onCancel,
}: {
  user: PublicUser;
  isSelf: boolean;
  onSave: (patch: { role?: Role; password?: string }) => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState<Role>(user.role);
  const [password, setPassword] = useState("");

  function save() {
    const patch: { role?: Role; password?: string } = {};
    if (role !== user.role) patch.role = role;
    if (password) patch.password = password;
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    onSave(patch);
    setPassword("");
  }

  return (
    <div className="space-y-3">
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
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
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
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function UserCard({
  user,
  isSelf,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: UserItemProps) {
  return (
    <div
      className={`rounded-[10px] border border-border bg-bg-elevated p-2.5 flex flex-col ${
        isEditing ? "" : "aspect-square"
      }`}
    >
      <div className="flex flex-col items-center text-center flex-1 justify-center gap-1.5 min-h-0">
        <div className="w-10 h-10 rounded-full bg-bg-card border border-border grid place-items-center text-base">
          👤
        </div>
        <div className="font-semibold text-[13px] truncate w-full leading-tight">
          {user.username}
        </div>
        {isSelf && (
          <span className="text-[9px] uppercase tracking-wider text-fg-dim font-mono leading-none">
            (you)
          </span>
        )}
        <span className={`chip ${roleChipClass(user.role)} !text-[10px] !px-1.5`}>
          {ROLE_LABEL[user.role]}
        </span>
      </div>
      <div className="flex gap-1 justify-center mt-2 pt-2 border-t border-border">
        {!isEditing && (
          <IconBtn label="Edit user" onClick={onStartEdit}>
            <PencilIcon className="w-4 h-4" />
          </IconBtn>
        )}
        <IconBtn
          label={isSelf ? "Cannot delete yourself" : "Delete user"}
          onClick={onDelete}
          disabled={isSelf}
          danger
        >
          <XIcon className="w-4 h-4" />
        </IconBtn>
      </div>
      {isEditing && (
        <div className="border-t border-border pt-3 mt-3">
          <UserEditFields
            user={user}
            isSelf={isSelf}
            onSave={onUpdate}
            onCancel={onCancelEdit}
          />
        </div>
      )}
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
}: UserItemProps) {
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
        <div className="flex gap-1 flex-shrink-0">
          {!isEditing && (
            <IconBtn label="Edit user" onClick={onStartEdit}>
              <PencilIcon className="w-4 h-4" />
            </IconBtn>
          )}
          <IconBtn
            label={isSelf ? "Cannot delete yourself" : "Delete user"}
            onClick={onDelete}
            disabled={isSelf}
            danger
          >
            <XIcon className="w-4 h-4" />
          </IconBtn>
        </div>
      </div>
      {isEditing && (
        <div className="border-t border-border p-3.5">
          <UserEditFields
            user={user}
            isSelf={isSelf}
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

function roleChipClass(role: Role): string {
  if (role === "admin") return "chip-loss";
  if (role === "editor") return "chip-win";
  return "chip-neutral";
}
