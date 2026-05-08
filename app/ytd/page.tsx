import { getSession } from "@/lib/auth";
import { listReports } from "@/lib/storage";
import { listReconciliations } from "@/lib/reconciliations";
import { listPotLedger } from "@/lib/pot";
import { ReportTabs } from "@/components/ReportTabs";
import type { Report } from "@/lib/types";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function YtdPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/ytd");
  if (session.role === "viewer") redirect("/");

  const [reports, reconciliations, potEntries] = await Promise.all([
    listReports({ includeArchived: true }),
    listReconciliations(),
    listPotLedger(),
  ]);

  // Archived games live in `reports` directly. For legacy reconciliations
  // whose sources were hard-deleted before archiving was introduced, fall
  // back to the embedded sourceReports / snapshot so YTD totals stay stable.
  const knownIds = new Set(reports.map((r) => r.id));
  const fromReconciled: Report[] = reconciliations.flatMap((r) => {
    const srcs =
      r.sourceReports && r.sourceReports.length > 0
        ? r.sourceReports
        : [
            {
              id: r.id,
              title: r.title,
              createdAt: r.createdAt,
              createdBy: r.createdBy,
              snapshot: r.snapshot,
            },
          ];
    return srcs.filter((s) => !knownIds.has(s.id));
  });

  const allReports = [...reports, ...fromReconciled];
  return (
    <ReportTabs
      reports={allReports}
      potEntries={potEntries}
      reconciliations={reconciliations}
      role={session.role}
    />
  );
}
