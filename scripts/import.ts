// Bulk import: npm run import -- ~/Downloads/crochet "https://example.com/pattern" one.pdf
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { importPdf, importUrl, type ImportResult } from "../src/lib/importer";

async function pdfsIn(target: string): Promise<string[]> {
  const s = await stat(target);
  if (s.isFile()) return target.toLowerCase().endsWith(".pdf") ? [target] : [];
  const entries = await readdir(target, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
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

  let failed = 0;
  for (const target of targets) {
    if (/^https?:\/\//.test(target)) {
      try { report(target, await importUrl(target, { forceClaude })); }
      catch (e) { failed++; console.log(`✗ ${target}: ${(e as Error).message}`); }
      continue;
    }
    for (const file of await pdfsIn(path.resolve(target.replace(/^~/, process.env.HOME ?? "~")))) {
      try { report(path.basename(file), await importPdf(await readFile(file), path.basename(file), { forceClaude })); }
      catch (e) { failed++; console.log(`✗ ${path.basename(file)}: ${(e as Error).message}`); }
    }
  }
  if (failed) process.exitCode = 1;
}

main();
