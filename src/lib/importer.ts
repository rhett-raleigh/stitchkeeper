import { createHash } from "node:crypto";
import { findPatternBySource, insertPattern, listPatternsBySourceFile } from "./db";
import { extractWithClaude, hasClaude } from "./extract/claude";
import { parsePatternText } from "./extract/heuristic";
import { fetchPage } from "./extract/html";
import { analyzePdf } from "./extractor";
import { putExtracted, putFile } from "./files";
import { looksComplete, type Pattern } from "./pattern";
import { checkStitchCounts } from "./stitchcheck";

export type ImportResult = { id: number; title: string; extractor: string; issueCount: number; duplicate: boolean };

type Source = { sourceUrl?: string; sourceFile?: string; imageUrl?: string | null; sourcePages?: { first: number; last: number } };

async function save(pattern: Pattern, extractor: string, source: Source): Promise<ImportResult> {
  const issues = checkStitchCounts(pattern);
  const id = await insertPattern({ pattern, issues, extractor, ...source });
  return { id, title: pattern.title, extractor, issueCount: issues.length, duplicate: false };
}

async function existing(sourceUrl: string | null, sourceFile: string | null): Promise<ImportResult | null> {
  const found = await findPatternBySource(sourceUrl, sourceFile);
  return found && { id: found.id, title: found.title, extractor: found.extractor, issueCount: found.issues.length, duplicate: true };
}

export async function importUrl(url: string, opts: { forceClaude?: boolean } = {}): Promise<ImportResult> {
  const dup = await existing(url, null);
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

export async function importPdf(data: Buffer, filename: string, opts: { forceClaude?: boolean } = {}): Promise<ImportResult[]> {
  // Name stored files by content so re-importing the same PDF is a no-op.
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  const stored = `${hash}.pdf`;
  const dups = await listPatternsBySourceFile(stored);
  if (dups.length) {
    return dups.map((d) => ({ id: d.id, title: d.title, extractor: d.extractor, issueCount: d.issues.length, duplicate: true }));
  }

  // Text, pattern-book splitting, rule-based parsing, and cover photos happen in the extractor.
  const analysis = await analyzePdf(data, hash, filename, { forceClaude: opts.forceClaude, claude: hasClaude() });
  if (!analysis.drafts.length && !hasClaude()) throw new Error(`No rows found in ${filename}. Set ANTHROPIC_API_KEY to let Claude read it.`);
  // Claude reads the PDF pages directly, including scans, charts, and photos.
  const drafts = analysis.drafts.length
    ? analysis.drafts.map((d) => ({ ...d, extractor: "rules" }))
    : [
        {
          pattern: await extractWithClaude({ kind: "pdf", data, filename }),
          extractor: "claude",
          sourcePages: { first: 1, last: analysis.pages },
          imageUrl: analysis.cover,
        },
      ];

  await putFile(stored, data);
  await putExtracted(analysis.files);
  const results: ImportResult[] = [];
  for (const d of drafts) {
    results.push(await save(d.pattern, d.extractor, { sourceFile: stored, sourcePages: d.sourcePages, imageUrl: d.imageUrl }));
  }
  return results;
}
