import { list, put, del } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Reconciliation } from "./types";

const BLOB_PATH = "reconciliations/reconciliations.json";
const LOCAL_FILE = path.join(process.cwd(), "data", "reconciliations.json");

const hasBlobToken = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function readLocal(): Promise<Reconciliation[]> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as Reconciliation[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.error("[reconciliations.local] read failed:", err);
    return [];
  }
}

async function writeLocal(items: Reconciliation[]): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(items, null, 2), "utf8");
}

async function readBlob(): Promise<Reconciliation[]> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!match) return [];
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as Reconciliation[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[reconciliations.blob] read failed:", err);
    return [];
  }
}

async function writeBlob(items: Reconciliation[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(items, null, 2), {
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
    console.error("[reconciliations.blob] remove failed:", err);
  }
}

async function readAll(): Promise<Reconciliation[]> {
  return hasBlobToken() ? readBlob() : readLocal();
}
async function writeAll(items: Reconciliation[]): Promise<void> {
  return hasBlobToken() ? writeBlob(items) : writeLocal(items);
}

export async function listReconciliations(): Promise<Reconciliation[]> {
  const items = await readAll();
  return items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getReconciliation(id: string): Promise<Reconciliation | null> {
  const items = await readAll();
  return items.find((r) => r.id === id) ?? null;
}

export async function saveReconciliation(item: Reconciliation): Promise<Reconciliation> {
  const items = await readAll();
  items.unshift(item);
  await writeAll(items);
  return item;
}

export async function deleteReconciliation(id: string): Promise<boolean> {
  const items = await readAll();
  const next = items.filter((r) => r.id !== id);
  if (next.length === items.length) return false;
  await writeAll(next);
  return true;
}

export async function purgeAllReconciliations(): Promise<void> {
  if (hasBlobToken()) await removeBlob();
  else {
    await fs.unlink(LOCAL_FILE).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  }
}
