import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { decode } from "./html";

const run = promisify(execFile);

type Line = { text: string; x0: number; y0: number; y1: number };
type Block = { x0: number; x1: number; y0: number; y1: number; lines: Line[] };

const num = (tag: string, attr: string) => Number(new RegExp(`${attr}="([\\d.]+)"`).exec(tag)?.[1] ?? 0);

function parsePages(xhtml: string): { width: number; blocks: Block[] }[] {
  return xhtml.split(/<page /).slice(1).map((page) => {
    const width = num(page, "width");
    const blocks: Block[] = [];
    for (const m of page.matchAll(/<block ([^>]*)>([\s\S]*?)<\/block>/g)) {
      const lines = [...m[2].matchAll(/<line ([^>]*)>([\s\S]*?)<\/line>/g)]
        .map((l) => ({
          text: [...l[2].matchAll(/<word [^>]*>([^<]*)<\/word>/g)].map((w) => decode(w[1])).join(" ").trim(),
          x0: num(l[1], "xMin"),
          y0: num(l[1], "yMin"),
          y1: num(l[1], "yMax"),
        }))
        .filter((l) => l.text);
      if (lines.length) blocks.push({ x0: num(m[1], "xMin"), x1: num(m[1], "xMax"), y0: num(m[1], "yMin"), y1: num(m[1], "yMax"), lines });
    }
    return { width, blocks };
  });
}

// Some designers lay rounds out as a table: a column of labels ("Rnd 1.",
// "Rnds 5-9.") with the instructions in a separate block beside it. Glue each
// instruction line onto the label it sits level with (wrapped lines included).
const LABEL_ONLY = /^(?:(?:rounds?|rnds?|rows?|r)\s*)?\d+(?:\s*[-–]\s*\d+)?\s*[.:)]?$/i;

function joinTableRows(blocks: Block[]): Block[] {
  for (const label of blocks) {
    if (!label.lines.every((l) => LABEL_ONLY.test(l.text)) || !label.lines.some((l) => /\D/.test(l.text))) continue;
    const beside = blocks.filter(
      (b) => b !== label && b.x0 > label.x0 && b.x0 - label.x1 < 150 && b.y0 < label.y1 + 4 && b.y1 > label.y0 - 4,
    );
    const rows = label.lines.map((l) => ({ ...l }));
    for (const b of beside) {
      b.lines = b.lines.filter((line) => {
        if (line.y0 < label.y0 - 4 || line.y0 > label.y1 + 4) return true;
        const row = rows.findLast((r) => r.y0 <= line.y0 + 4) ?? rows[0];
        row.text += " " + line.text;
        return false;
      });
    }
    label.lines = rows;
    label.x1 = Math.max(label.x1, ...beside.map((b) => b.x1));
  }
  return blocks.filter((b) => b.lines.length);
}

// Patterns are often laid out in two or three columns. Find vertical gutters
// that no (narrow) block crosses, then read each column top to bottom.
// Full-width blocks (titles, banners) split the page into horizontal bands.
function orderBlocks(width: number, blocks: Block[]): Block[] {
  const narrow = blocks.filter((b) => b.x1 - b.x0 < width * 0.6);
  const covered = new Uint8Array(Math.ceil(width) + 1);
  for (const b of narrow) for (let x = Math.floor(b.x0); x <= Math.ceil(b.x1) && x < covered.length; x++) covered[x] = 1;
  const gutters: number[] = [];
  let start = -1;
  for (let x = Math.floor(width * 0.2); x < width * 0.8; x++) {
    if (!covered[x] && start < 0) start = x;
    if ((covered[x] || x + 1 >= width * 0.8) && start >= 0) {
      if (x - start >= 8) gutters.push((start + x) / 2);
      start = -1;
    }
  }
  // Blocks on both sides of a gutter count as columns only if each side has text.
  const cols = gutters.filter((g) => narrow.some((b) => b.x1 <= g) && narrow.some((b) => b.x0 >= g));
  const colOf = (b: Block) => cols.filter((g) => b.x0 >= g).length;
  const spans = (b: Block) => cols.some((g) => b.x0 < g && b.x1 > g);

  const out: Block[] = [];
  let band: Block[] = [];
  const flush = () => {
    band.sort((a, b) => colOf(a) - colOf(b) || a.y0 - b.y0);
    out.push(...band);
    band = [];
  };
  for (const b of [...blocks].sort((a, b) => a.y0 - b.y0)) {
    if (cols.length && spans(b)) {
      flush();
      out.push(b);
    } else band.push(b);
  }
  flush();
  return out;
}

export function layoutText(xhtml: string): string {
  const pages = parsePages(xhtml);
  // Drop running headers/footers (lines on most pages) and page numbers first,
  // so a centered banner doesn't hide the gutter between columns.
  const seen = new Map<string, number>();
  for (const p of pages) for (const line of new Set(p.blocks.flatMap((b) => b.lines.map((l) => l.text)))) seen.set(line, (seen.get(line) ?? 0) + 1);
  // Row labels ("Rnd 1.") and stitch counts repeat across pieces, so never drop those.
  const keep = (line: string) =>
    !/^\d{1,3}$|^\d+\/\d+$/.test(line) &&
    (LABEL_ONLY.test(line) || /[([]\d+[)\]]$/.test(line) || !(pages.length >= 3 && (seen.get(line) ?? 0) >= pages.length * 0.5));
  return pages
    .map((p) => {
      const blocks = p.blocks.map((b) => ({ ...b, lines: b.lines.filter((l) => keep(l.text)) })).filter((b) => b.lines.length);
      return orderBlocks(p.width, joinTableRows(blocks)).map((b) => b.lines.map((l) => l.text).join("\n")).join("\n\n");
    })
    // Pages are separated by a form-feed line so later steps know which page text came from.
    .join("\n\f\n");
}

export async function pdfText(file: string): Promise<string | null> {
  try {
    const { stdout } = await run("pdftotext", ["-bbox-layout", file, "-"], { maxBuffer: 200 * 1024 * 1024 });
    return layoutText(stdout);
  } catch {
    return null;
  }
}
