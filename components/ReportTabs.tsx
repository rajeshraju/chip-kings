"use client";

import { useState } from "react";
import type { PotLedgerEntry, Report } from "@/lib/types";
import { YtdView } from "./YtdView";
import { PotView } from "./PotView";

type Tab = "ytd" | "pot";

export function ReportTabs({
  reports,
  potEntries,
}: {
  reports: Report[];
  potEntries: PotLedgerEntry[];
}) {
  const [tab, setTab] = useState<Tab>("ytd");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border" role="tablist">
        <TabButton active={tab === "ytd"} onClick={() => setTab("ytd")}>
          📈 YTD
        </TabButton>
        <TabButton active={tab === "pot"} onClick={() => setTab("pot")}>
          💰 Pot ({potEntries.length})
        </TabButton>
      </div>

      {tab === "ytd" ? (
        <YtdView reports={reports} />
      ) : (
        <PotView entries={potEntries} />
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
