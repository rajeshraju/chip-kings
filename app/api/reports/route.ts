import { NextResponse } from "next/server";
import { AuthError, requireCanWrite, requireSession } from "@/lib/auth";
import { listReports, saveReport } from "@/lib/storage";
import type { CalculationResult, Report } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireSession();
    const url = new URL(request.url);
    const includeArchived = url.searchParams.get("include") === "archived";
    if (includeArchived) {
      const all = await listReports({ includeArchived: true });
      return NextResponse.json({
        reports: all.filter((r) => !r.archived),
        archivedReports: all.filter((r) => r.archived),
      });
    }
    const reports = await listReports();
    return NextResponse.json({ reports });
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
      title?: string;
      gameDate?: string;
      snapshot?: CalculationResult;
    } | null;

    if (!body?.snapshot || !Array.isArray(body.snapshot.people)) {
      return NextResponse.json({ error: "Invalid snapshot" }, { status: 400 });
    }

    const report: Report = {
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: (body.title || "Untitled game").slice(0, 120),
      createdAt: new Date().toISOString(),
      gameDate:
        typeof body.gameDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.gameDate)
          ? body.gameDate
          : undefined,
      createdBy: session.username,
      snapshot: body.snapshot,
    };

    const saved = await saveReport(report);
    return NextResponse.json({ report: saved }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
