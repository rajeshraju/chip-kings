import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { deleteUser, getUser, toPublic, updateUser } from "@/lib/users";
import { ROLES, type Role } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const user = await getUser(params.id);
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ user: toPublic(user) });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    const body = (await request.json().catch(() => null)) as {
      username?: string;
      password?: string;
      role?: Role;
    } | null;
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    if (body.role !== undefined && !ROLES.includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Prevent self-demotion from admin (would lock out the last admin).
    if (session.userId === params.id && body.role !== undefined && body.role !== "admin") {
      return NextResponse.json(
        { error: "Cannot demote yourself from admin" },
        { status: 400 }
      );
    }

    const updated = await updateUser(params.id, body);
    return NextResponse.json({ user: toPublic(updated) });
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
    const session = await requireAdmin();
    if (session.userId === params.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }
    const ok = await deleteUser(params.id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
