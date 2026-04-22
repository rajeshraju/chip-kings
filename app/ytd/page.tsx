import { getSession } from "@/lib/auth";
import { listReports } from "@/lib/storage";
import { YtdView } from "@/components/YtdView";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function YtdPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/ytd");
  if (session.role === "viewer") redirect("/");

  const reports = await listReports();
  return <YtdView reports={reports} />;
}
