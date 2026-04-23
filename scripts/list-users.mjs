#!/usr/bin/env node
import { list } from "@vercel/blob";
import { readFileSync } from "node:fs";

// Load .env.local (dotenv-style, un-escaping `\$` → `$`).
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const val = m[2].replace(/^["'](.*)["']$/, "$1").replace(/\\\$/g, "$");
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
} catch {}

const showHashes = process.argv.includes("--hashes");
const asJson = process.argv.includes("--json");

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN not set — cannot reach the Vercel Blob store.");
  process.exit(1);
}

const { blobs } = await list({ prefix: "users/", limit: 10 });
const match = blobs.find((b) => b.pathname === "users/users.json");
if (!match) {
  console.log("No users.json blob found (store is empty).");
  process.exit(0);
}

const res = await fetch(match.url, { cache: "no-store" });
if (!res.ok) {
  console.error(`Failed to fetch blob: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const users = await res.json();

if (asJson) {
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}

if (users.length === 0) {
  console.log("No users in store.");
  process.exit(0);
}

const rows = users.map((u) => ({
  username: u.username,
  role: u.role,
  created: new Date(u.createdAt).toISOString().slice(0, 16).replace("T", " "),
  id: u.id,
  hash: u.passwordHash,
}));

const cols = showHashes
  ? ["username", "role", "created", "id", "hash"]
  : ["username", "role", "created", "id"];

const widths = Object.fromEntries(
  cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => String(r[c]).length))])
);

const header = cols.map((c) => c.toUpperCase().padEnd(widths[c])).join("  ");
const sep = cols.map((c) => "─".repeat(widths[c])).join("  ");
console.log(header);
console.log(sep);
for (const r of rows) {
  console.log(cols.map((c) => String(r[c]).padEnd(widths[c])).join("  "));
}
console.log(`\n${users.length} user${users.length === 1 ? "" : "s"} · blob: ${match.url}`);
if (!showHashes) console.log("(pass --hashes to include password hashes, or --json for raw JSON)");
