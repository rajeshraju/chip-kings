import { list, put, del } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Report } from "./types";

const BLOB_PATH = "reports/reports.json";
const LOCAL_FILE = path.join(process.cwd(), "data", "reports.json");

const hasBlobToken = () => !!process.env.BLOB_READ_WRITE_TOKEN;

// --- Local filesystem adapter (dev / self-host) ---
async function readLocal(): Promise<Report[]> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as Report[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.error("[storage.local] read failed:", err);
    return [];
  }
}

async function writeLocal(reports: Report[]): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(reports, null, 2), "utf8");
}

async function removeLocal(): Promise<void> {
  try {
    await fs.unlink(LOCAL_FILE);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[storage.local] remove failed:", err);
    }
  }
}

// --- Vercel Blob adapter (prod) ---
async function readBlob(): Promise<Report[]> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!match) return [];
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as Report[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[storage.blob] read failed:", err);
    return [];
  }
}

async function writeBlob(reports: Report[]): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(reports, null, 2), {
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
    console.error("[storage.blob] remove failed:", err);
  }
}

// --- Dispatcher ---
async function readAllReports(): Promise<Report[]> {
  return hasBlobToken() ? readBlob() : readLocal();
}

async function writeAllReports(reports: Report[]): Promise<void> {
  if (hasBlobToken()) return writeBlob(reports);
  return writeLocal(reports);
}

// --- Public API ---
export async function listReports(): Promise<Report[]> {
  const reports = await readAllReports();
  return reports.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getReport(id: string): Promise<Report | null> {
  const reports = await readAllReports();
  return reports.find((r) => r.id === id) ?? null;
}

export async function saveReport(report: Report): Promise<Report> {
  const reports = await readAllReports();
  reports.unshift(report);
  await writeAllReports(reports);
  return report;
}

export async function deleteReport(id: string): Promise<boolean> {
  const reports = await readAllReports();
  const next = reports.filter((r) => r.id !== id);
  if (next.length === reports.length) return false;
  await writeAllReports(next);
  return true;
}

export async function purgeAllReports(): Promise<void> {
  if (hasBlobToken()) await removeBlob();
  else await removeLocal();
}

export function storageBackend(): "blob" | "local" {
  return hasBlobToken() ? "blob" : "local";
}
