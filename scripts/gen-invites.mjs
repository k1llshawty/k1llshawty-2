// Использование: node scripts/gen-invites.mjs 5 [дней_действия]
import { randomInt, createHash } from "node:crypto";
const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const n = Number(process.argv[2] ?? 5), days = process.argv[3] ? Number(process.argv[3]) : null;
const group = () => Array.from({ length: 4 }, () => A[randomInt(A.length)]).join("");
const rows = [];
console.log("Коды для друзей (показываются один раз, в базе хранятся только хеши):\n");
for (let i = 0; i < n; i++) {
  const code = [group(), group(), group(), group()].join("-");
  const hash = createHash("sha256").update(code.replace(/[^A-Z0-9]/g, "")).digest("hex");
  rows.push(`('${hash}'${days ? `, now() + interval '${days} days'` : ", null"})`);
  console.log("  " + code);
}
console.log("\nВыполните в Supabase → SQL Editor:\n");
console.log(`insert into public.invite_codes (code_hash, expires_at) values\n${rows.join(",\n")};`);
