import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth";
import { getSettings, setSettings } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSession();
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      initialChipsTaken?: unknown;
      chipsIncrement?: unknown;
    };
    const updated = await setSettings({
      initialChipsTaken:
        body.initialChipsTaken !== undefined
          ? Number(body.initialChipsTaken)
          : undefined,
      chipsIncrement:
        body.chipsIncrement !== undefined
          ? Number(body.chipsIncrement)
          : undefined,
    });
    return NextResponse.json({ settings: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
