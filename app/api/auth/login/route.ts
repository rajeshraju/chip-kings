import { NextResponse } from "next/server";
import {
  authenticate,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;

  if (!body?.username || !body?.password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  const user = await authenticate(body.username, body.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const session = { userId: user.id, username: user.username, role: user.role };
  const token = await createSessionToken(session);
  await setSessionCookie(token);
  return NextResponse.json({ ok: true, user: session });
}
