"use client";

import { useState } from "react";
import type { Player, PublicUser } from "@/lib/types";
import { UsersManager } from "./UsersManager";
import { PlayersManager } from "./PlayersManager";

type Tab = "users" | "players";

export function AdminTabs({
  initialUsers,
  currentUserId,
  initialPlayers,
}: {
  initialUsers: PublicUser[];
  currentUserId: string;
  initialPlayers: Player[];
}) {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border" role="tablist">
        <TabButton active={tab === "users"} onClick={() => setTab("users")}>
          👤 Users ({initialUsers.length})
        </TabButton>
        <TabButton active={tab === "players"} onClick={() => setTab("players")}>
          🎲 Players ({initialPlayers.length})
        </TabButton>
      </div>

      {tab === "users" ? (
        <UsersManager initialUsers={initialUsers} currentUserId={currentUserId} />
      ) : (
        <PlayersManager initialPlayers={initialPlayers} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-display font-semibold border-b-2 -mb-px transition-colors ${
        active
          ? "border-accent text-fg"
          : "border-transparent text-fg-dim hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
