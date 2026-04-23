#!/usr/bin/env node
import { put, del, list } from "@vercel/blob";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

// Load .env.local (dotenv-style). Un-escapes `\$` → `$` so bcrypt hashes and
// tokens pulled from the file are usable directly.
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    const val = rawVal.replace(/^["'](.*)["']$/, "$1").replace(/\\\$/g, "$");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

const username = process.argv[2];
const password = process.argv[3];
if (!username || !password) {
  console.error("Usage: node scripts/reset-admin.mjs <username> <password>");
  console.error("Example: node scripts/reset-admin.mjs admin 'my-new-password'");
  process.exit(1);
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN not set — cannot reach the Vercel Blob store.");
  process.exit(1);
}

const BLOB_PATH = "users/users.json";

const { blobs: existing } = await list({ prefix: "users/", limit: 100 });
if (existing.length === 0) {
  console.log("No existing users blob found.");
} else {
  for (const b of existing) {
    await del(b.url);
    console.log(`Deleted ${b.pathname}`);
  }
}

const admin = {
  id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  username,
  passwordHash: bcrypt.hashSync(password, 10),
  role: "admin",
  createdAt: new Date().toISOString(),
};

await put(BLOB_PATH, JSON.stringify([admin], null, 2), {
  access: "public",
  contentType: "application/json",
  addRandomSuffix: false,
  allowOverwrite: true,
});

console.log(`\n✓ Purged all users`);
console.log(`✓ Created admin "${username}" with fresh password hash`);
console.log(`\nLog in at https://chip-kings-site.vercel.app/login`);
