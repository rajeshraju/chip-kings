import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import {
  createSessionToken,
  readSessionFromToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "./session";
import type { Role, SessionUser, User } from "./types";
import { ROLE_PERMISSIONS } from "./types";
import { getUser, getUserByUsername, seedIfEmpty } from "./users";

// Node-runtime auth helpers (bcrypt + cookies). Do NOT import from middleware.ts.

export { createSessionToken, readSessionFromToken, SESSION_COOKIE_NAME };

export async function authenticate(
  username: string,
  password: string
): Promise<User | null> {
  await seedIfEmpty();
  const user = await getUserByUsername(username);
  if (!user) return null;
  try {
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await readSessionFromToken(token);
  if (!session) return null;

  // Verify user still exists (so deleted users lose access immediately).
  const user = await getUser(session.userId);
  if (!user) return null;

  // Role may have changed since login — return the up-to-date role.
  if (user.role !== session.role) {
    return { userId: user.id, username: user.username, role: user.role };
  }
  return session;
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthError("Unauthorized", 401);
  return session;
}

export async function requireRole(
  ...allowed: Role[]
): Promise<SessionUser> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) {
    throw new AuthError("Forbidden", 403);
  }
  return session;
}

export async function requireCanWrite(): Promise<SessionUser> {
  const session = await requireSession();
  if (!ROLE_PERMISSIONS[session.role].canWrite) {
    throw new AuthError("Forbidden: write access required", 403);
  }
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("admin");
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE_NAME);
}
