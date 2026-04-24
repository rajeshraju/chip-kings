import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { deletePlayer, getPlayer, updatePlayer } from "@/lib/players";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const player = await getPlayer(params.id);
    if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ player });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = (await request.json().catch(() => null)) as {
      name?: string;
    } | null;
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const updated = await updatePlayer(params.id, body);
    return NextResponse.json({ player: updated });
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
    await requireAdmin();
    const ok = await deletePlayer(params.id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
