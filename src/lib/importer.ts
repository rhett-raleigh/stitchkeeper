import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { FILES_DIR, findPatternBySource, insertPattern, listPatternsBySourceFile } from "./db";
import { extractWithClaude, hasClaude } from "./extract/claude";
import { parsePatternText, splitCollection } from "./extract/heuristic";
import { fetchPage } from "./extract/html";
import { coverFor, pageCount } from "./extract/images";
import { pdfText } from "./extract/pdf";
import type { Pattern } from "./pattern";
import { checkStitchCounts } from "./stitchcheck";

export type ImportResult = { id: number; title: string; extractor: string; issueCount: number; duplicate: boolean };

// Rule-based parsing is free and instant, so try it first and only call
// Claude when it didn't find a usable pattern.
const rowsOf = (p: Pattern) => p.sections.flatMap((s) => s.steps).filter((s) => s.kind === "row");

function looksComplete(p: Pattern): boolean {
  const rows = rowsOf(p);
  return rows.length >= 3 && rows.filter((r) => r.stitchCount != null).length >= rows.length / 2;
}

type Source = { sourceUrl?: string; sourceFile?: string; imageUrl?: string | null; sourcePages?: { first: number; last: number } };

function save(pattern: Pattern, extractor: string, source: Source): ImportResult {
  const issues = checkStitchCounts(pattern);
  const id = insertPattern({ pattern, issues, extractor, ...source });
  return { id, title: pattern.title, extractor, issueCount: issues.length, duplicate: false };
}

function existing(sourceUrl: string | null, sourceFile: string | null): ImportResult | null {
  const found = findPatternBySource(sourceUrl, sourceFile);
  return found && { id: found.id, title: found.title, extractor: found.extractor, issueCount: found.issues.length, duplicate: true };
}

export async function importUrl(url: string, opts: { forceClaude?: boolean } = {}): Promise<ImportResult> {
  const dup = existing(url, null);
  if (dup) return dup;

  const page = await fetchPage(url);
  let pattern = parsePatternText(page.text, { title: page.title, sourceUrl: url });
  let extractor = "rules";
  if ((opts.forceClaude || !looksComplete(pattern)) && hasClaude()) {
    pattern = await extractWithClaude({ kind: "text", text: page.text, title: page.title, sourceUrl: url });
    extractor = "claude";
  }
  if (pattern.sections.length === 0) {
    throw new Error(
      hasClaude()
        ? "No pattern found on that page."
        : "Couldn't find rows on that page. Set ANTHROPIC_API_KEY to let Claude read less structured patterns.",
    );
  }
  return save(pattern, extractor, { sourceUrl: url, imageUrl: page.images[0] });
}

// "31_Oddish_Pattern_English" -> "Oddish", "CharlietheChubbyDragonOFFICIALpattern" -> "Charlie the Chubby Dragon"
export function titleFromFilename(filename: string): string {
  const t = path
    .basename(filename, path.extname(filename))
    .replace(/[-_]+/g, " ")
    .replace(/official\s*pattern|pattern\s*official|pattern(?=\s|$)/gi, " ")
    .replace(/([a-z])(the|and|of|or)(?=[A-Z])/g, "$1 $2 ")
    .replace(/([a-z])(?=[A-Z\d])|(\d)(?=[A-Za-z])/g, "$1$2 ")
    .replace(/\b(official|pattern|english|copy|compressed|kit|crochet)\b/gi, " ")
    .replace(/^\s*\d+\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase()) || filename;
}

// Files named "Unknown.pdf" or "scan 3.pdf" say nothing; use the PDF's first line instead.
function pickTitle(filename: string, text: string | null): string {
  const fromName = titleFromFilename(filename);
  if (!/^(unknown|untitled|document|scan|download|file|pattern|img)?\s*\d*$/i.test(fromName)) return fromName;
  const first = text
    ?.split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .find((l) => l.length > 2 && l.length < 60 && !/[™©®\d]|^(materials|supplies|abbreviations)$/i.test(l));
  return first ?? fromName;
}

export async function importPdf(data: Buffer, filename: string, opts: { forceClaude?: boolean } = {}): Promise<ImportResult[]> {
  // Name stored files by content so re-importing the same PDF is a no-op.
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  const stored = `${hash}.pdf`;
  const dups = listPatternsBySourceFile(stored);
  if (dups.length) {
    return dups.map((d) => ({ id: d.id, title: d.title, extractor: d.extractor, issueCount: d.issues.length, duplicate: true }));
  }

  const filePath = path.join(FILES_DIR, stored);
  await writeFile(filePath, data);
  const pages = await pageCount(filePath).catch(() => 1);
  const whole = { first: 1, last: pages };
  // Look for the cover photo on the first few pages; the picker can reach the rest.
  const cover = (range: { first: number; last: number }, book = false) =>
    coverFor(filePath, hash, { first: range.first, last: Math.min(range.last, range.first + 3) }, FILES_DIR, { book }).catch(() => null);

  const text = opts.forceClaude ? null : await pdfText(filePath);
  const title = pickTitle(filename, text);
  if (text) {
    // A pattern book becomes one library entry per pattern.
    const parts = splitCollection(text);
    if (parts) {
      const parsed = parts
        .map((p) => ({ pattern: parsePatternText(p.text, { title: p.title }), pages: p.pages }))
        .filter((p) => rowsOf(p.pattern).length > 0);
      if (parsed.length) {
        const results: ImportResult[] = [];
        for (const p of parsed) {
          const pattern = { ...p.pattern, notes: [`From ${title}.`, ...p.pattern.notes] };
          results.push(save(pattern, "rules", { sourceFile: stored, sourcePages: p.pages, imageUrl: await cover(p.pages, true) }));
        }
        return results;
      }
    }
    const parsed = parsePatternText(text, { title });
    if (looksComplete(parsed) || (!hasClaude() && rowsOf(parsed).length > 0)) {
      return [save(parsed, "rules", { sourceFile: stored, sourcePages: whole, imageUrl: await cover(whole) })];
    }
  }

  if (hasClaude()) {
    // Claude reads the PDF pages directly, including scans, charts, and photos.
    const pattern = await extractWithClaude({ kind: "pdf", data, filename });
    return [save(pattern, "claude", { sourceFile: stored, sourcePages: whole, imageUrl: await cover(whole) })];
  }
  throw new Error(`No rows found in ${filename}. Set ANTHROPIC_API_KEY to let Claude read it.`);
}
