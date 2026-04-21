import { getSession } from "@/lib/auth";
import { listReports } from "@/lib/storage";
import { ReportsView } from "@/components/ReportsView";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/reports");

  const reports = await listReports();
  return <ReportsView initialReports={reports} role={session.role} />;
}
