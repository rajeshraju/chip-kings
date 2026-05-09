import { NextResponse } from "next/server";
import { AuthError, requireCanWrite } from "@/lib/auth";
import { listReconciliations } from "@/lib/reconciliations";
import { getReport, unarchiveReport } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireCanWrite();

    const report = await getReport(params.id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const reconciliations = await listReconciliations();
    const parent = reconciliations.find(
      (r) =>
        r.reportIds.includes(params.id) ||
        Boolean(r.sourceReports?.some((src) => src.id === params.id))
    );
    if (parent) {
      return NextResponse.json(
        {
          error:
            "This game is part of a reconciliation. Undo the reconciliation before moving it to Saved Games.",
        },
        { status: 400 }
      );
    }

    const restored = await unarchiveReport(params.id);
    return NextResponse.json({ report: restored ?? report });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
