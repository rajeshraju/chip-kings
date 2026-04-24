import { list, put, del } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Player } from "./types";

const BLOB_PATH = "players/players.json";
const LOCAL_FILE = path.join(process.cwd(), "data", "players.json");

const hasBlobToken = () => !!process.env.BLOB_READ_WRITE_TOKEN;

// --- Local filesystem adapter ---
async function readLocal(): Promise<Player[]> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as Player[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.error("[players.local] read failed:", err);
    return [];
  }
}

async function writeLocal(players: Player[]): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(players, null, 2), "utf8");
}

// --- Blob adapter ---
async function readBlob(): Promise<Player[]> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!match) return [];
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as Player[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[players.blob] read failed:", err);
    return [];
  }
}

async function writeBlob(players: Player[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(players, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function removeBlob(): Promise<void> {
  try {
    await del(BLOB_PATH);
  } catch (err) {
    console.error("[players.blob] remove failed:", err);
  }
}

async function readAll(): Promise<Player[]> {
  return hasBlobToken() ? readBlob() : readLocal();
}
async function writeAll(players: Player[]): Promise<void> {
  return hasBlobToken() ? writeBlob(players) : writeLocal(players);
}

// --- Helpers ---
function newId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

// --- Public API ---
export async function listPlayers(): Promise<Player[]> {
  const players = await readAll();
  return players.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPlayer(id: string): Promise<Player | null> {
  const players = await readAll();
  return players.find((p) => p.id === id) ?? null;
}

export async function createPlayer(input: { name: string }): Promise<Player> {
  const name = input.name.trim();
  if (!name) throw new Error("Name required");
  const players = await readAll();
  if (players.some((p) => normalize(p.name) === normalize(name))) {
    throw new Error("Player already exists");
  }
  const player: Player = {
    id: newId(),
    name,
    createdAt: new Date().toISOString(),
  };
  players.push(player);
  await writeAll(players);
  return player;
}

export async function updatePlayer(
  id: string,
  patch: { name?: string }
): Promise<Player> {
  const players = await readAll();
  const idx = players.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Player not found");
  const p = players[idx];

  if (patch.name !== undefined && patch.name.trim() !== p.name) {
    const next = patch.name.trim();
    if (!next) throw new Error("Name required");
    if (players.some((x) => x.id !== id && normalize(x.name) === normalize(next))) {
      throw new Error("Player already exists");
    }
    p.name = next;
  }

  players[idx] = p;
  await writeAll(players);
  return p;
}

export async function deletePlayer(id: string): Promise<boolean> {
  const players = await readAll();
  const next = players.filter((p) => p.id !== id);
  if (next.length === players.length) return false;
  await writeAll(next);
  return true;
}

export async function purgeAllPlayers(): Promise<void> {
  try {
    if (hasBlobToken()) {
      await removeBlob();
    } else {
      await fs.unlink(LOCAL_FILE).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
      });
    }
  } catch (err) {
    console.error("[players] purge failed:", err);
  }
}

// --- Bootstrap: seed default roster if empty ---
const DEFAULT_ROSTER = [
  "Aravind", "Chiru", "Danthuluri", "Eshwar", "Kishore", "Krishna", "Mahesh",
  "Patange", "Prafulla", "Rajesh", "Rama Raju", "Ranjith", "Ravindra", "Sandeep",
  "Srikanth", "Surya", "Varahalu", "Vamsi",
];

let seedPromise: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const players = await readAll();
    if (players.length > 0) return;

    const now = Date.now();
    const seeded: Player[] = DEFAULT_ROSTER.map((name, i) => ({
      id: `p_${now}_${i.toString(36).padStart(2, "0")}`,
      name,
      createdAt: new Date(now).toISOString(),
    }));
    await writeAll(seeded);
    console.log(`[players] seeded ${seeded.length} default players`);
  })().catch((err) => {
    console.error("[players] seed failed:", err);
    seedPromise = null;
  });
  return seedPromise;
}
