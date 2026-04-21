import { SignJWT, jwtVerify } from "jose";
import type { Role, SessionUser } from "./types";

// Edge-safe session helpers (JWT only, no bcrypt). Used by middleware.ts.

export const SESSION_COOKIE_NAME = "ck_session";
const ALG = "HS256";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_JWT_SECRET is missing or too short (need 32+ chars). See .env.local.example."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    userId: user.userId,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function readSessionFromToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      username: payload.username,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}
