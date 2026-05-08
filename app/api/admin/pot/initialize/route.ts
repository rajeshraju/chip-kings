import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { replacePotLedger } from "@/lib/pot";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      entries?: unknown;
    };
    if (!Array.isArray(body.entries)) {
      return NextResponse.json(
        { error: "entries must be an array of { name, amount }" },
        { status: 400 }
      );
    }
    const entries: { name: string; amount: number }[] = [];
    for (const raw of body.entries) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as { name?: unknown; amount?: unknown };
      const name = String(e.name ?? "").trim();
      const amount = Number(e.amount);
      if (!name) continue;
      if (!Number.isFinite(amount)) continue;
      entries.push({ name, amount });
    }
    const saved = await replacePotLedger(entries);
    return NextResponse.json({ entries: saved });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
