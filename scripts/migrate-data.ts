// One-time copy of the pre-Cloudflare data (data/stitchkeeper.db + data/files) into D1 and R2.
//
//   npx tsx scripts/migrate-data.ts            # local (.wrangler/, what `npm run dev` uses)
//   npx tsx scripts/migrate-data.ts --remote   # the deployed app's D1 + R2
//
// Refuses to run against a database that already has patterns, so it can't clobber
// progress tracked since (pass --replace to wipe and copy again).
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = process.env.STITCHKEEPER_DATA ?? path.join(process.cwd(), "data");
const OUT = path.join(DATA_DIR, "migrate");
const where = process.argv.includes("--remote") ? "--remote" : "--local";
const replace = process.argv.includes("--replace");

const wrangler = (...args: string[]) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

const literal = (v: unknown) =>
  v == null ? "NULL" : typeof v === "number" || typeof v === "bigint" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

function inserts(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  return rows.map((r) => `INSERT INTO ${table} (${Object.keys(r).join(", ")}) VALUES (${Object.values(r).map(literal).join(", ")});`);
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const existing = JSON.parse(wrangler("d1", "execute", "stitchkeeper", where, "--json", "--command", "SELECT COUNT(*) AS n FROM patterns"));
  const count = existing[0].results[0].n as number;
  if (count > 0 && !replace) {
    console.error(`D1 (${where.slice(2)}) already has ${count} patterns. Pass --replace to wipe it and copy again.`);
    process.exit(1);
  }

  const db = new DatabaseSync(path.join(DATA_DIR, "stitchkeeper.db"), { readOnly: true });
  const sql = [
    "DELETE FROM projects;",
    "DELETE FROM patterns;",
    ...inserts(db, "patterns"),
    ...inserts(db, "projects"),
  ];
  const sqlFile = path.join(OUT, "d1.sql");
  writeFileSync(sqlFile, sql.join("\n") + "\n");
  console.log(`Copying ${sql.length - 2} rows into D1 (${where.slice(2)})…`);
  wrangler("d1", "execute", "stitchkeeper", where, "--yes", "--file", sqlFile);

  const files = readdirSync(path.join(DATA_DIR, "files")).filter((n) => /^[a-f0-9]{16}(\.pdf|-p\d+(-i\d+)?\.jpg)$/.test(n));
  for (const [ext, type] of [[".pdf", "application/pdf"], [".jpg", "image/jpeg"]]) {
    const list = files.filter((n) => n.endsWith(ext)).map((key) => ({ key, file: path.join(DATA_DIR, "files", key) }));
    const listFile = path.join(OUT, `r2${ext}.json`);
    writeFileSync(listFile, JSON.stringify(list));
    console.log(`Uploading ${list.length} ${ext} files to R2 (${where.slice(2)})…`);
    wrangler("r2", "bulk", "put", "stitchkeeper-files", where, "--force", "--ct", type, "--filename", listFile);
  }

  const check = JSON.parse(
    wrangler("d1", "execute", "stitchkeeper", where, "--json", "--command", "SELECT (SELECT COUNT(*) FROM patterns) AS patterns, (SELECT COUNT(*) FROM projects) AS projects"),
  );
  console.log("Done:", check[0].results[0]);
}

main();
