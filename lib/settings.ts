import { list, put } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";

const BLOB_PATH = "settings/settings.json";
const LOCAL_FILE = path.join(process.cwd(), "data", "settings.json");

export type Settings = {
  initialChipsTaken: number;
  chipsIncrement: number;
};

export const DEFAULT_SETTINGS: Settings = {
  initialChipsTaken: 250,
  chipsIncrement: 50,
};

const hasBlobToken = () => !!process.env.BLOB_READ_WRITE_TOKEN;

function normalize(s: Partial<Settings> | null | undefined): Settings {
  const initial = Number(s?.initialChipsTaken);
  const inc = Number(s?.chipsIncrement);
  return {
    initialChipsTaken:
      Number.isFinite(initial) && initial >= 0
        ? Math.round(initial)
        : DEFAULT_SETTINGS.initialChipsTaken,
    chipsIncrement:
      Number.isFinite(inc) && inc >= 1
        ? Math.round(inc)
        : DEFAULT_SETTINGS.chipsIncrement,
  };
}

async function readLocal(): Promise<Settings> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    return normalize(JSON.parse(raw));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { ...DEFAULT_SETTINGS };
    }
    console.error("[settings.local] read failed:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

async function writeLocal(s: Settings): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(s, null, 2), "utf8");
}

async function readBlob(): Promise<Settings> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!match) return { ...DEFAULT_SETTINGS };
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return { ...DEFAULT_SETTINGS };
    return normalize((await res.json()) as Partial<Settings>);
  } catch (err) {
    console.error("[settings.blob] read failed:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

async function writeBlob(s: Settings): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(s, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function getSettings(): Promise<Settings> {
  return hasBlobToken() ? readBlob() : readLocal();
}

export async function setSettings(s: Partial<Settings>): Promise<Settings> {
  const merged = normalize({ ...(await getSettings()), ...s });
  if (hasBlobToken()) await writeBlob(merged);
  else await writeLocal(merged);
  return merged;
}
