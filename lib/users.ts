import { list, put, del } from "@vercel/blob";
import bcrypt from "bcryptjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PublicUser, Role, User } from "./types";

const BLOB_PATH = "users/users.json";
const LOCAL_FILE = path.join(process.cwd(), "data", "users.json");

const hasBlobToken = () => !!process.env.BLOB_READ_WRITE_TOKEN;

// --- Local filesystem adapter ---
async function readLocal(): Promise<User[]> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as User[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.error("[users.local] read failed:", err);
    return [];
  }
}

async function writeLocal(users: User[]): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(users, null, 2), "utf8");
}

// --- Blob adapter ---
async function readBlob(): Promise<User[]> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!match) return [];
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as User[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[users.blob] read failed:", err);
    return [];
  }
}

async function writeBlob(users: User[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(users, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function readAll(): Promise<User[]> {
  return hasBlobToken() ? readBlob() : readLocal();
}
async function writeAll(users: User[]): Promise<void> {
  return hasBlobToken() ? writeBlob(users) : writeLocal(users);
}

// --- Helpers ---
function newId(): string {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function toPublic(user: User): PublicUser {
  const { passwordHash: _hash, ...rest } = user;
  return rest;
}

function normalize(username: string): string {
  return username.trim().toLowerCase();
}

// --- Public API ---
export async function listUsers(): Promise<User[]> {
  const users = await readAll();
  return users.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function getUser(id: string): Promise<User | null> {
  const users = await readAll();
  return users.find((u) => u.id === id) ?? null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const users = await readAll();
  const n = normalize(username);
  return users.find((u) => normalize(u.username) === n) ?? null;
}

export async function userCount(): Promise<number> {
  const users = await readAll();
  return users.length;
}

export async function createUser(input: {
  username: string;
  password: string;
  role: Role;
}): Promise<User> {
  const username = input.username.trim();
  if (!username) throw new Error("Username required");
  if (!input.password || input.password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  const users = await readAll();
  if (users.some((u) => normalize(u.username) === normalize(username))) {
    throw new Error("Username already exists");
  }
  const user: User = {
    id: newId(),
    username,
    passwordHash: bcrypt.hashSync(input.password, 10),
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeAll(users);
  return user;
}

export async function updateUser(
  id: string,
  patch: { password?: string; role?: Role; username?: string }
): Promise<User> {
  const users = await readAll();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error("User not found");
  const u = users[idx];

  if (patch.username !== undefined && patch.username.trim() !== u.username) {
    const next = patch.username.trim();
    if (!next) throw new Error("Username required");
    if (users.some((x) => x.id !== id && normalize(x.username) === normalize(next))) {
      throw new Error("Username already exists");
    }
    u.username = next;
  }
  if (patch.role !== undefined) u.role = patch.role;
  if (patch.password !== undefined && patch.password !== "") {
    if (patch.password.length < 6) throw new Error("Password must be at least 6 characters");
    u.passwordHash = bcrypt.hashSync(patch.password, 10);
  }

  users[idx] = u;
  await writeAll(users);
  return u;
}

export async function deleteUser(id: string): Promise<boolean> {
  const users = await readAll();
  const next = users.filter((u) => u.id !== id);
  if (next.length === users.length) return false;
  await writeAll(next);
  return true;
}

// --- Bootstrap: seed from env if empty ---
let seedPromise: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const users = await readAll();
    if (users.length > 0) return;

    const envUser = process.env.AUTH_USERNAME;
    const envHash = process.env.AUTH_PASSWORD_HASH;
    if (!envUser || !envHash) return;

    const admin: User = {
      id: newId(),
      username: envUser,
      passwordHash: envHash,
      role: "admin",
      createdAt: new Date().toISOString(),
    };
    await writeAll([admin]);
    console.log(`[users] seeded admin "${envUser}" from env vars`);
  })().catch((err) => {
    console.error("[users] seed failed:", err);
    seedPromise = null;
  });
  return seedPromise;
}

export async function purgeAllUsers(): Promise<void> {
  try {
    if (hasBlobToken()) {
      await del(BLOB_PATH);
    } else {
      await fs.unlink(LOCAL_FILE).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
      });
    }
  } catch (err) {
    console.error("[users] purge failed:", err);
  }
}
