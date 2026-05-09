import { getSession } from "@/lib/auth";
import {
  listReports,
  saveReport,
  syncReportArchiveFlags,
} from "@/lib/storage";
import { listReconciliations } from "@/lib/reconciliations";
import { ReportsView } from "@/components/ReportsView";
import type { Report } from "@/lib/types";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/games");

  const reconciliations = await listReconciliations();

  // Build the master set of game ids that appear in any reconciliation.
  // Anything in this set should be archived; anything outside it should not.
  const reconciledIds = new Set<string>();
  for (const recon of reconciliations) {
    for (const id of recon.reportIds) reconciledIds.add(id);
    for (const src of recon.sourceReports ?? []) reconciledIds.add(src.id);
  }

  // Legacy reconciliations hard-deleted their source games. Fold those
  // sourceReports into games.json as archived so they show up under the
  // Archived Games section. Idempotent — only adds reports we don't have.
  const known = await listReports({ includeArchived: true });
  const knownIds = new Set(known.map((r) => r.id));
  for (const recon of reconciliations) {
    for (const src of recon.sourceReports ?? []) {
      if (knownIds.has(src.id)) continue;
      await saveReport({
        ...src,
        archived: true,
        archivedAt: recon.createdAt,
      });
      knownIds.add(src.id);
    }
  }

  // Make sure every game's archived flag agrees with the reconciliation set.
  await syncReportArchiveFlags(reconciledIds);

  const all = await listReports({ includeArchived: true });
  const reports = all.filter((r) => !r.archived);
  const archivedReports: Report[] = all.filter((r) => r.archived);
  return (
    <ReportsView
      initialReports={reports}
      initialArchivedReports={archivedReports}
      initialReconciliations={reconciliations}
      role={session.role}
    />
  );
}
