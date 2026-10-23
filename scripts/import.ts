// Bulk import: npm run import -- ~/Downloads/crochet "https://example.com/pattern" one.pdf
//
// Sends each link/PDF to a running Stitchkeeper: `npm run dev` (http://localhost:3000) unless
// STITCHKEEPER_URL is set. The deployed app sits behind Cloudflare Access, so for it also set
// CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (an Access service token).
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ImportResult } from "../src/lib/importer";

const BASE = (process.env.STITCHKEEPER_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function pdfsIn(target: string): Promise<string[]> {
  const s = await stat(target);
  if (s.isFile()) return target.toLowerCase().endsWith(".pdf") ? [target] : [];
  const entries = await readdir(target, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

async function send(form: FormData): Promise<ImportResult[]> {
  const headers: Record<string, string> = { "x-stitchkeeper-import": "1" };
  if (process.env.CF_ACCESS_CLIENT_ID) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET ?? "";
  }
  const res = await fetch(`${BASE}/api/import`, { method: "POST", body: form, headers, redirect: "manual" });
  if (res.status >= 300 && res.status < 400) throw new Error("Redirected (to a login page?). Set CF_ACCESS_CLIENT_ID/SECRET.");
  const json = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { results?: ImportResult[]; error?: string };
  if (!res.ok || !json.results) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.results;
}

function report(name: string, r: ImportResult) {
  const note = r.duplicate ? "already imported" : `${r.extractor}${r.issueCount ? `, ${r.issueCount} count check(s)` : ""}`;
  console.log(`✓ ${name} → #${r.id} ${r.title} (${note})`);
}

async function main() {
  const args = process.argv.slice(2);
  const forceClaude = args.includes("--claude");
  const targets = args.filter((a) => a !== "--claude");
  if (targets.length === 0) {
    console.log("Usage: npm run import -- [--claude] <folder | file.pdf | url>...");
    process.exit(1);
  }

  console.log(`Importing into ${BASE}`);
  let failed = 0;
  for (const target of targets) {
    const form = new FormData();
    if (forceClaude) form.set("forceClaude", "1");
    if (/^https?:\/\//.test(target)) {
      form.set("url", target);
      try { for (const r of await send(form)) report(target, r); }
      catch (e) { failed++; console.log(`✗ ${target}: ${(e as Error).message}`); }
      continue;
    }
    for (const file of await pdfsIn(path.resolve(target.replace(/^~/, process.env.HOME ?? "~")))) {
      const name = path.basename(file);
      form.set("pdf", new File([await readFile(file)], name, { type: "application/pdf" }));
      try { for (const r of await send(form)) report(name, r); }
      catch (e) { failed++; console.log(`✗ ${name}: ${(e as Error).message}`); }
    }
  }
  if (failed) process.exitCode = 1;
}

main();
