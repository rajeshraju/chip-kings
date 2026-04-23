import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { forceResetAdmin, toPublic } from "@/lib/users";

// TEMPORARY ONE-SHOT endpoint for recovering a broken admin in prod.
// Call once with `x-reset-key: <AUTH_JWT_SECRET>` then delete this file.

export const runtime = "nodejs";

function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_JWT_SECRET not set" }, { status: 500 });
  }

  const provided = request.headers.get("x-reset-key") ?? "";
  if (!timingSafeEq(provided, secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await forceResetAdmin();
  if (!result.ok) {
    const msg =
      result.reason === "missing-env"
        ? "AUTH_USERNAME or AUTH_PASSWORD_HASH env var is not set"
        : "AUTH_PASSWORD_HASH does not look like a bcrypt hash (must start with $2a$, $2b$, or $2y$ — check for \\$ escaping)";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user: toPublic(result.user) });
}
