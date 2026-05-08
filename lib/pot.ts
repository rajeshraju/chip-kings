import { list, put, del } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PotLedgerEntry } from "./types";

const BLOB_PATH = "pot/pot.json";
const LOCAL_FILE = path.join(process.cwd(), "data", "pot.json");

const hasBlobToken = () => !!process.env.BLOB_READ_WRITE_TOKEN;

// --- Local filesystem adapter ---
async function readLocal(): Promise<PotLedgerEntry[]> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as PotLedgerEntry[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.error("[pot.local] read failed:", err);
    return [];
  }
}

async function writeLocal(entries: PotLedgerEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(entries, null, 2), "utf8");
}

// --- Blob adapter ---
async function readBlob(): Promise<PotLedgerEntry[]> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!match) return [];
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as PotLedgerEntry[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[pot.blob] read failed:", err);
    return [];
  }
}

async function writeBlob(entries: PotLedgerEntry[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(entries, null, 2), {
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
    console.error("[pot.blob] remove failed:", err);
  }
}

async function readAll(): Promise<PotLedgerEntry[]> {
  return hasBlobToken() ? readBlob() : readLocal();
}
async function writeAll(entries: PotLedgerEntry[]): Promise<void> {
  return hasBlobToken() ? writeBlob(entries) : writeLocal(entries);
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

// --- Public API ---
export async function listPotLedger(): Promise<PotLedgerEntry[]> {
  const entries = await readAll();
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPotEntry(name: string): Promise<PotLedgerEntry | null> {
  const entries = await readAll();
  const n = normalize(name);
  return entries.find((e) => normalize(e.name) === n) ?? null;
}

export async function upsertPotEntry(input: {
  name: string;
  amount: number;
}): Promise<PotLedgerEntry> {
  const name = input.name.trim();
  if (!name) throw new Error("Name required");
  if (!Number.isFinite(input.amount)) throw new Error("Amount must be a number");

  const entries = await readAll();
  const idx = entries.findIndex((e) => normalize(e.name) === normalize(name));
  const now = new Date().toISOString();
  const next: PotLedgerEntry = { name, amount: input.amount, updatedAt: now };
  if (idx === -1) {
    entries.push(next);
  } else {
    entries[idx] = { ...entries[idx], ...next };
  }
  await writeAll(entries);
  return next;
}

export async function adjustPotEntry(
  name: string,
  delta: number
): Promise<PotLedgerEntry> {
  const existing = await getPotEntry(name);
  const current = existing?.amount ?? 0;
  return upsertPotEntry({ name, amount: current + delta });
}

export async function deletePotEntry(name: string): Promise<boolean> {
  const entries = await readAll();
  const n = normalize(name);
  const next = entries.filter((e) => normalize(e.name) !== n);
  if (next.length === entries.length) return false;
  await writeAll(next);
  return true;
}

// Wholesale-replace the pot ledger with the given entries. Used by the admin
// "Initialize Pot Balances" flow: anyone not in the input list is dropped,
// and entries with a zero amount are filtered out so the file stays clean.
export async function replacePotLedger(
  entries: { name: string; amount: number }[]
): Promise<PotLedgerEntry[]> {
  const now = new Date().toISOString();
  // Collapse duplicates by normalised name, keeping the last occurrence.
  const byKey = new Map<string, PotLedgerEntry>();
  for (const raw of entries) {
    const name = String(raw.name ?? "").trim();
    const amount = Number(raw.amount);
    if (!name) continue;
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.01) {
      byKey.delete(normalize(name));
      continue;
    }
    byKey.set(normalize(name), { name, amount, updatedAt: now });
  }
  const next = Array.from(byKey.values());
  await writeAll(next);
  return next;
}

export async function purgeAllPotEntries(): Promise<void> {
  if (hasBlobToken()) await removeBlob();
  else {
    await fs.unlink(LOCAL_FILE).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  }
}

// POT ledger total: amount owed TO the pot minus what the pot owes out.
// Sign convention on each entry: amount > 0 means POT owes the player,
// amount < 0 means the player owes POT — so summing the negatives' absolute
// values minus the positives gives "owed to pot − pot owes".
export function totalPotLedger(entries: PotLedgerEntry[]): number {
  return entries.reduce(
    (sum, e) => sum - (Number(e.amount) || 0),
    0
  );
}
