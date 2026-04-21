import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth";
import { createUser, listUsers, toPublic } from "@/lib/users";
import { ROLES, type Role } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const users = await listUsers();
    return NextResponse.json({ users: users.map(toPublic) });
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
      username?: string;
      password?: string;
      role?: Role;
    } | null;

    if (!body?.username || !body?.password || !body?.role) {
      return NextResponse.json(
        { error: "username, password, and role are required" },
        { status: 400 }
      );
    }
    if (!ROLES.includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const user = await createUser({
      username: body.username,
      password: body.password,
      role: body.role,
    });
    return NextResponse.json({ user: toPublic(user) }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
