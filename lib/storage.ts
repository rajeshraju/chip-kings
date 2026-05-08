import { list, put, del } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Report } from "./types";

const BLOB_PATH = "games/games.json";
const LOCAL_FILE = path.join(process.cwd(), "data", "games.json");
// Legacy paths kept only for a one-time read fallback so existing data
// migrates into games.json on the first write. Once games.json exists,
// these are ignored.
const LEGACY_BLOB_PATH = "reports/reports.json";
const LEGACY_LOCAL_FILE = path.join(process.cwd(), "data", "reports.json");

const hasBlobToken = () => !!process.env.BLOB_READ_WRITE_TOKEN;

// --- Local filesystem adapter (dev / self-host) ---
async function readLocal(): Promise<Report[]> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as Report[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[storage.local] read failed:", err);
      return [];
    }
  }
  try {
    const raw = await fs.readFile(LEGACY_LOCAL_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as Report[]) : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[storage.local] legacy read failed:", err);
    }
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
async function readBlobAt(blobPath: string): Promise<Report[] | null> {
  try {
    const { blobs } = await list({ prefix: blobPath, limit: 1 });
    const match = blobs.find((b) => b.pathname === blobPath);
    if (!match) return null;
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Report[];
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[storage.blob] read ${blobPath} failed:`, err);
    return null;
  }
}

async function readBlob(): Promise<Report[]> {
  const fresh = await readBlobAt(BLOB_PATH);
  if (fresh !== null) return fresh;
  const legacy = await readBlobAt(LEGACY_BLOB_PATH);
  return legacy ?? [];
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
export async function listReports(
  opts: { includeArchived?: boolean } = {}
): Promise<Report[]> {
  const reports = await readAllReports();
  const filtered = opts.includeArchived
    ? reports
    : reports.filter((r) => !r.archived);
  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getReport(id: string): Promise<Report | null> {
  const reports = await readAllReports();
  return reports.find((r) => r.id === id) ?? null;
}

export async function saveReport(report: Report): Promise<Report> {
  const reports = await readAllReports();
  // Always persist an explicit archived flag so every game on disk has it set.
  const normalized: Report = {
    ...report,
    archived: typeof report.archived === "boolean" ? report.archived : false,
  };
  reports.unshift(normalized);
  await writeAllReports(reports);
  return normalized;
}

export async function updateReport(
  id: string,
  patch: Partial<Pick<Report, "title" | "gameDate" | "snapshot">>
): Promise<Report | null> {
  const reports = await readAllReports();
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: Report = { ...reports[idx] };
  if (patch.title !== undefined) updated.title = patch.title;
  if (patch.gameDate !== undefined) updated.gameDate = patch.gameDate;
  if (patch.snapshot !== undefined) updated.snapshot = patch.snapshot;
  reports[idx] = updated;
  await writeAllReports(reports);
  return updated;
}

export async function deleteReport(id: string): Promise<boolean> {
  const reports = await readAllReports();
  const next = reports.filter((r) => r.id !== id);
  if (next.length === reports.length) return false;
  await writeAllReports(next);
  return true;
}

export async function archiveReport(id: string): Promise<Report | null> {
  const reports = await readAllReports();
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  if (reports[idx].archived) return reports[idx];
  const updated: Report = {
    ...reports[idx],
    archived: true,
    archivedAt: new Date().toISOString(),
  };
  reports[idx] = updated;
  await writeAllReports(reports);
  return updated;
}

export async function unarchiveReport(id: string): Promise<Report | null> {
  const reports = await readAllReports();
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  if (reports[idx].archived === false) return reports[idx];
  const { archivedAt: _ts, ...rest } = reports[idx];
  void _ts;
  const updated: Report = { ...rest, archived: false };
  reports[idx] = updated;
  await writeAllReports(reports);
  return updated;
}

// Make every game's archived flag agree with whether it appears in any
// reconciliation. Pass the union of every reconciliation's reportIds. Used as
// a one-shot migration to backfill the flag on legacy games.
export async function syncReportArchiveFlags(
  reconciledIds: Set<string>
): Promise<number> {
  const reports = await readAllReports();
  let changed = 0;
  const now = new Date().toISOString();
  const next = reports.map((r) => {
    const shouldBeArchived = reconciledIds.has(r.id);
    if (shouldBeArchived) {
      if (r.archived === true && r.archivedAt) return r;
      changed++;
      return { ...r, archived: true, archivedAt: r.archivedAt ?? now };
    }
    if (r.archived === false) return r;
    changed++;
    const { archivedAt: _ts, ...rest } = r;
    void _ts;
    return { ...rest, archived: false };
  });
  if (changed > 0) await writeAllReports(next);
  return changed;
}

export async function purgeAllReports(): Promise<void> {
  if (hasBlobToken()) await removeBlob();
  else await removeLocal();
}

export function storageBackend(): "blob" | "local" {
  return hasBlobToken() ? "blob" : "local";
}
