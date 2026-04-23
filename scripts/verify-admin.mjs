import { list } from "@vercel/blob";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const val = m[2].replace(/^["'](.*)["']$/, "$1").replace(/\\\$/g, "$");
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
} catch {}

const { blobs } = await list({ prefix: "users/", limit: 10 });
console.log("Blobs under users/:");
for (const b of blobs) console.log(" -", b.pathname, "→", b.url);

const match = blobs.find((b) => b.pathname === "users/users.json");
if (!match) { console.log("\nNo users.json blob found!"); process.exit(0); }

const res = await fetch(match.url, { cache: "no-store" });
console.log("\nfetch status:", res.status);
const text = await res.text();
console.log("body:", text);
try {
  const users = JSON.parse(text);
  for (const u of users) {
    console.log(`\nUser: ${u.username} (${u.role})`);
    console.log(` hash: ${u.passwordHash}`);
    console.log(` bcrypt.compare('Daisy007$') = ${bcrypt.compareSync("Daisy007$", u.passwordHash)}`);
  }
} catch (e) {
  console.log("JSON parse failed:", e.message);
}
