import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { FILES_DIR, findPatternBySource, insertPattern } from "./db";
import { extractWithClaude, hasClaude } from "./extract/claude";
import { parsePatternText } from "./extract/heuristic";
import { fetchPage } from "./extract/html";
import type { Pattern } from "./pattern";
import { checkStitchCounts } from "./stitchcheck";

export type ImportResult = { id: number; title: string; extractor: string; issueCount: number; duplicate: boolean };

// Rule-based parsing is free and instant, so try it first and only call
// Claude when it didn't find a usable pattern.
function looksComplete(p: Pattern): boolean {
  const rows = p.sections.flatMap((s) => s.steps).filter((s) => s.kind === "row");
  return rows.length >= 3 && rows.filter((r) => r.stitchCount != null).length >= rows.length / 2;
}

function save(pattern: Pattern, extractor: string, source: { sourceUrl?: string; sourceFile?: string; imageUrl?: string }): ImportResult {
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

const run = promisify(execFile);

async function pdfText(file: string): Promise<string | null> {
  try {
    const { stdout } = await run("pdftotext", ["-layout", "-nopgbrk", file, "-"], { maxBuffer: 20 * 1024 * 1024 });
    return stdout.replace(/ {3,}/g, "  ");
  } catch {
    return null;
  }
}

export async function importPdf(data: Buffer, filename: string, opts: { forceClaude?: boolean } = {}): Promise<ImportResult> {
  // Name stored files by content so re-importing the same PDF is a no-op.
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  const stored = `${hash}.pdf`;
  const dup = existing(null, stored);
  if (dup) return dup;

  const filePath = path.join(FILES_DIR, stored);
  await writeFile(filePath, data);
  const title = path.basename(filename, path.extname(filename)).replace(/[-_]+/g, " ");

  const text = opts.forceClaude ? null : await pdfText(filePath);
  const parsed = text ? parsePatternText(text, { title }) : null;
  if (parsed && looksComplete(parsed)) return save(parsed, "rules", { sourceFile: stored });

  if (hasClaude()) {
    // Claude reads the PDF pages directly, including scans, charts, and photos.
    const pattern = await extractWithClaude({ kind: "pdf", data, filename });
    return save(pattern, "claude", { sourceFile: stored });
  }
  if (parsed && parsed.sections.length > 0) return save(parsed, "rules", { sourceFile: stored });
  throw new Error(`No rows found in ${filename}. Set ANTHROPIC_API_KEY to let Claude read it.`);
}
