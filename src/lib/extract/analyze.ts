import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { looksComplete, rowsOf, type Pattern } from "../pattern";
import { parsePatternText, splitCollection } from "./heuristic";
import { coverFor, pageCount, photoCandidates, savePageRender, savePhoto, type PageRange } from "./images";
import { pdfText } from "./pdf";

// The PDF half of importing, which needs poppler and sharp. It runs in the extractor
// container (extractor/server.ts), never in the Worker. Everything it makes is
// returned as files for the caller to store; nothing here touches the database.

export type ExtractedFile = { name: string; data: string /* base64 */ };

export type PdfDraft = { pattern: Pattern; sourcePages: PageRange; imageUrl: string | null };

export type PdfAnalysis = {
  pages: number;
  /** Patterns the rule-based parser found. Empty means the PDF needs Claude (or can't be read). */
  drafts: PdfDraft[];
  /** Cover for the whole PDF, for when Claude reads it instead. */
  cover: string | null;
  files: ExtractedFile[];
};

export type PhotoChoices = { photos: string[]; pageRenders: string[]; files: ExtractedFile[] };

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

/** Runs `fn` with the PDF written to a scratch folder, then returns everything else written there. */
async function inScratch<T>(
  data: Buffer,
  hash: string,
  fn: (file: string, dir: string) => Promise<T>,
): Promise<{ result: T; files: ExtractedFile[] }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "stitchkeeper-extract-"));
  try {
    const file = path.join(dir, `${hash}.pdf`);
    await writeFile(file, data);
    const result = await fn(file, dir);
    const names = (await readdir(dir)).filter((n) => n.endsWith(".jpg"));
    const files = await Promise.all(names.map(async (name) => ({ name, data: (await readFile(path.join(dir, name))).toString("base64") })));
    return { result, files };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function analyzePdf(
  data: Buffer,
  hash: string,
  filename: string,
  opts: { forceClaude?: boolean; claude?: boolean } = {},
): Promise<PdfAnalysis> {
  const { result, files } = await inScratch(data, hash, async (file, dir) => {
    const pages = await pageCount(file).catch(() => 1);
    const whole = { first: 1, last: pages };
    // Look for the cover photo on the first few pages; the picker can reach the rest.
    const cover = (range: PageRange, book = false) =>
      coverFor(file, hash, { first: range.first, last: Math.min(range.last, range.first + 3) }, dir, { book }).catch(() => null);

    const text = opts.forceClaude ? null : await pdfText(file);
    const title = pickTitle(filename, text);
    if (text) {
      // A pattern book becomes one library entry per pattern.
      const parts = splitCollection(text);
      if (parts) {
        const parsed = parts
          .map((p) => ({ pattern: parsePatternText(p.text, { title: p.title }), pages: p.pages }))
          .filter((p) => rowsOf(p.pattern).length > 0);
        if (parsed.length) {
          const drafts: PdfDraft[] = [];
          for (const p of parsed) {
            const pattern = { ...p.pattern, notes: [`From ${title}.`, ...p.pattern.notes] };
            drafts.push({ pattern, sourcePages: p.pages, imageUrl: await cover(p.pages, true) });
          }
          return { pages, drafts, cover: null };
        }
      }
      const parsed = parsePatternText(text, { title });
      if (looksComplete(parsed) || (!opts.claude && rowsOf(parsed).length > 0)) {
        return { pages, drafts: [{ pattern: parsed, sourcePages: whole, imageUrl: await cover(whole) }], cover: null };
      }
    }
    // No usable rows: the caller hands the PDF to Claude, if it can.
    return { pages, drafts: [], cover: opts.claude ? await cover(whole) : null };
  });
  return { ...result, files };
}

const MAX_PHOTOS = 24;
const MAX_PAGES = 8;

/** Photos and page renders to choose a pattern's cover from (see /patterns/[id]/photo). */
export async function photoChoices(data: Buffer, hash: string, range: PageRange): Promise<PhotoChoices> {
  const { result, files } = await inScratch(data, hash, async (file, dir) => {
    const photos: string[] = [];
    for (const c of (await photoCandidates(file, range)).slice(0, MAX_PHOTOS)) {
      const name = await savePhoto(file, hash, c, dir);
      if (name) photos.push(name);
    }
    const pageRenders: string[] = [];
    for (let page = range.first; page <= Math.min(range.last, range.first + MAX_PAGES - 1); page++) {
      const name = await savePageRender(file, hash, page, dir);
      if (name) pageRenders.push(name);
    }
    return { photos, pageRenders };
  });
  return { ...result, files };
}
