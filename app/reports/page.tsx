import { getSession } from "@/lib/auth";
import { listReports } from "@/lib/storage";
import { listReconciliations } from "@/lib/reconciliations";
import { ReportsView } from "@/components/ReportsView";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/reports");

  const [reports, reconciliations] = await Promise.all([
    listReports(),
    listReconciliations(),
  ]);
  return (
    <ReportsView
      initialReports={reports}
      initialReconciliations={reconciliations}
      role={session.role}
    />
  );
}
