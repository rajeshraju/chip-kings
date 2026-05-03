"use client";

import { useMemo, useState } from "react";
import type { PotLedgerEntry, Reconciliation, Report, Role } from "@/lib/types";
import { YtdView } from "./YtdView";
import { PotView } from "./PotView";
import { PaymentsView } from "./PaymentsView";

type Tab = "ytd" | "pot" | "payments";

export function ReportTabs({
  reports,
  potEntries,
  reconciliations,
  role,
}: {
  reports: Report[];
  potEntries: PotLedgerEntry[];
  reconciliations: Reconciliation[];
  role: Role;
}) {
  const [tab, setTab] = useState<Tab>("ytd");
  const canWrite = role === "admin" || role === "editor";

  const outstandingCount = useMemo(() => {
    let n = 0;
    for (const r of reconciliations) {
      r.snapshot.transactions.forEach((_, i) => {
        if (!r.payments?.[i]) n += 1;
      });
    }
    return n;
  }, [reconciliations]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border no-print" role="tablist">
        <TabButton active={tab === "ytd"} onClick={() => setTab("ytd")}>
          📈 YTD
        </TabButton>
        <TabButton active={tab === "pot"} onClick={() => setTab("pot")}>
          💰 Pot ({potEntries.length})
        </TabButton>
        <TabButton
          active={tab === "payments"}
          onClick={() => setTab("payments")}
        >
          💳 Payments{outstandingCount > 0 ? ` (${outstandingCount})` : ""}
        </TabButton>
      </div>

      {tab === "ytd" && <YtdView reports={reports} />}
      {tab === "pot" && <PotView entries={potEntries} />}
      {tab === "payments" && (
        <PaymentsView
          initialReconciliations={reconciliations}
          canWrite={canWrite}
        />
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
