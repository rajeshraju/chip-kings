import { NextResponse } from "next/server";
import { AuthError, requireAdmin, requireSession } from "@/lib/auth";
import { createPlayer, listPlayers, seedIfEmpty } from "@/lib/players";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSession();
    await seedIfEmpty();
    const players = await listPlayers();
    return NextResponse.json({ players });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json().catch(() => null)) as {
      name?: string;
    } | null;

    if (!body?.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const player = await createPlayer({ name: body.name });
    return NextResponse.json({ player }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
