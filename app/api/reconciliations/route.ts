import { NextResponse } from "next/server";
import { AuthError, requireCanWrite, requireSession } from "@/lib/auth";
import { calculatePayments, combinePeople } from "@/lib/calc";
import { deleteReport, getReport } from "@/lib/storage";
import { listReconciliations, saveReconciliation } from "@/lib/reconciliations";
import type { Reconciliation } from "@/lib/types";

export const runtime = "nodejs";

function newId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function GET() {
  try {
    await requireSession();
    const items = await listReconciliations();
    return NextResponse.json({ reconciliations: items });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireCanWrite();
    const body = (await request.json().catch(() => null)) as {
      reportIds?: string[];
      title?: string;
    } | null;

    const ids = Array.isArray(body?.reportIds) ? body!.reportIds : [];
    if (ids.length < 1) {
      return NextResponse.json(
        { error: "Select at least one game to reconcile" },
        { status: 400 }
      );
    }

    const reports = await Promise.all(ids.map((id) => getReport(id)));
    const found = reports.filter((r): r is NonNullable<typeof r> => !!r);
    if (found.length !== ids.length) {
      return NextResponse.json(
        { error: "One or more selected games no longer exist" },
        { status: 404 }
      );
    }

    const combined = combinePeople(found);
    const result = calculatePayments(combined);
    if (!result) {
      return NextResponse.json(
        { error: "Need at least 2 distinct players across selected games" },
        { status: 400 }
      );
    }

    const titles = found.map((r) => r.title);
    const defaultTitle =
      found.length === 1
        ? `Reconciled: ${titles[0]}`
        : `Reconciled ${found.length} games`;

    const item: Reconciliation = {
      id: newId(),
      title: (body?.title || "").trim() || defaultTitle,
      createdAt: new Date().toISOString(),
      createdBy: session.username,
      reportIds: found.map((r) => r.id),
      reportTitles: titles,
      sourceReports: JSON.parse(JSON.stringify(found)),
      snapshot: result,
    };

    await saveReconciliation(item);
    await Promise.all(found.map((r) => deleteReport(r.id)));

    return NextResponse.json({ reconciliation: item }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Reconcile failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
