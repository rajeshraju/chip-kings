import { NextResponse } from "next/server";
import { AuthError, requireCanWrite, requireSession } from "@/lib/auth";
import { deleteReport, getReport, updateReport } from "@/lib/storage";
import type { CalculationResult } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const report = await getReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ report });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireCanWrite();
    const body = (await request.json().catch(() => null)) as {
      title?: string;
      snapshot?: CalculationResult;
    } | null;
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const updated = await updateReport(params.id, body);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ report: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireCanWrite();
    const deleted = await deleteReport(params.id);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
