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
    listReports(),
    listReconciliations(),
    listPotLedger(),
  ]);

  const fromReconciled: Report[] = reconciliations.flatMap((r) => {
    if (r.sourceReports && r.sourceReports.length > 0) return r.sourceReports;
    return [
      {
        id: r.id,
        title: r.title,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        snapshot: r.snapshot,
      },
    ];
  });

  const allReports = [...reports, ...fromReconciled];
  return <ReportTabs reports={allReports} potEntries={potEntries} />;
}
