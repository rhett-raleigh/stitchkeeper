import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

// Pulls photos out of pattern PDFs for library tiles. Pattern PDFs mix the
// finished-piece photo with logos, banners, and small step-by-step shots, so
// candidates are ranked by size, shape, and how early they appear.

const run = promisify(execFile);

export type PageRange = { first: number; last: number };
export type PhotoCandidate = {
  page: number;
  index: number;
  width: number;
  height: number;
  score: number;
};

type Listed = {
  page: number;
  type: string;
  width: number;
  height: number;
  object: string;
};

async function listImages(file: string, range: PageRange): Promise<Listed[]> {
  const { stdout } = await run("pdfimages", ["-list", "-f", String(range.first), "-l", String(range.last), file]);
  return stdout
    .split("\n")
    .slice(2)
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c.length > 10)
    .map((c) => ({
      page: Number(c[0]),
      type: c[2],
      width: Number(c[3]),
      height: Number(c[4]),
      object: c[10],
    }));
}

export async function pageCount(file: string): Promise<number> {
  const { stdout } = await run("pdfinfo", [file]);
  return Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 1);
}

// Listing a whole document is cheap; pattern books ask for it once per pattern.
const listCache = new Map<string, Promise<Listed[]>>();
function listAll(file: string): Promise<Listed[]> {
  if (!listCache.has(file)) {
    listCache.set(
      file,
      pageCount(file).then((n) => listImages(file, { first: 1, last: n })),
    );
    if (listCache.size > 20) listCache.delete(listCache.keys().next().value!);
  }
  return listCache.get(file)!;
}

export async function photoCandidates(file: string, range: PageRange): Promise<PhotoCandidate[]> {
  let listed: Listed[];
  try {
    listed = await listAll(file);
  } catch {
    return [];
  }
  // Images reused on several pages anywhere in the PDF are logos, banners, and
  // shared how-to pictures, not the photo of this pattern.
  const pagesPerObject = new Map<string, Set<number>>();
  for (const l of listed) pagesPerObject.set(l.object, (pagesPerObject.get(l.object) ?? new Set()).add(l.page));

  const out: PhotoCandidate[] = [];
  const perPage = new Map<number, number>();
  for (const l of listed) {
    // Position within its page, matching what `pdfimages -f page -l page` extracts.
    const index = perPage.get(l.page) ?? 0;
    perPage.set(l.page, index + 1);
    if (l.page < range.first || l.page > range.last || l.type !== "image") continue;
    if ((pagesPerObject.get(l.object)?.size ?? 0) > 1) continue;
    const ratio = l.width / l.height;
    // Tall is fine (bottles, highlighters); very wide is a banner.
    if (l.width < 250 || l.height < 250 || ratio < 0.33 || ratio > 2) continue;
    // Past ~1.5 megapixels every photo is big enough, so size stops mattering
    // and an earlier page wins (the hero photo usually comes first).
    const score = Math.min(l.width * l.height, 1_500_000) / (1 + (l.page - range.first));
    out.push({ page: l.page, index, width: l.width, height: l.height, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

const photoName = (hash: string, c: { page: number; index?: number }) =>
  c.index == null ? `${hash}-p${c.page}.jpg` : `${hash}-p${c.page}-i${c.index}.jpg`;

type Saved = { name: string; coverage: number };
type ExtractedPage = { tmp: string; files: string[]; listed: Listed[] };
type PageCache = Map<number, Promise<ExtractedPage>>;

async function extractPage(file: string, page: number): Promise<ExtractedPage> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "stitchkeeper-"));
  const listed = await listImages(file, { first: page, last: page });
  await run("pdfimages", ["-png", "-f", String(page), "-l", String(page), file, path.join(tmp, "img")]);
  return { tmp, files: (await readdir(tmp)).sort(), listed };
}

async function cleanup(cache: PageCache) {
  for (const p of cache.values()) await p.then((e) => rm(e.tmp, { recursive: true, force: true })).catch(() => {});
}

/** Writes the candidate as a JPEG in `dir` (if not already there) and returns its file name. */
export async function savePhoto(
  file: string,
  hash: string,
  c: { page: number; index: number },
  dir: string,
): Promise<string | null> {
  const cache: PageCache = new Map();
  try {
    return (await extractPhoto(file, hash, c, dir, cache))?.name ?? null;
  } finally {
    await cleanup(cache);
  }
}

/**
 * Like savePhoto, but also reports how much of the image is opaque (1 for
 * unmasked images). Already-saved files report 1 since we can't re-measure cheaply.
 */
async function extractPhoto(
  file: string,
  hash: string,
  c: { page: number; index: number },
  dir: string,
  cache: PageCache,
): Promise<Saved | null> {
  const name = photoName(hash, c);
  if (existsSync(path.join(dir, name))) return { name, coverage: 1 };
  let coverage = 1;
  try {
    if (!cache.has(c.page)) cache.set(c.page, extractPage(file, c.page));
    const { tmp, files, listed } = await cache.get(c.page)!;
    if (files.length !== listed.length || !files[c.index]) return null;
    let img = sharp(path.join(tmp, files[c.index]));
    // Cut-out photos keep their transparency in a separate "smask" image.
    if (listed[c.index + 1]?.type === "smask") {
      const meta = await img.metadata();
      const mask = await sharp(path.join(tmp, files[c.index + 1]))
        .resize(meta.width, meta.height, { fit: "fill" })
        .toColourspace("b-w")
        .raw()
        .toBuffer();
      coverage = mask.reduce((sum, v) => sum + v, 0) / (mask.length * 255);
      // pdfimages never writes alpha into the base image, so the mask becomes the alpha channel.
      // (Don't chain removeAlpha() here: sharp runs it after joinChannel and drops the mask.)
      img = sharp(
        await img
          .joinChannel(mask, {
            raw: { width: meta.width!, height: meta.height!, channels: 1 },
          })
          .png()
          .toBuffer(),
      );
    }
    await img
      .flatten({ background: "#fffdf8" })
      .toColourspace("srgb")
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(dir, name));
    return { name, coverage };
  } catch {
    return null;
  }
}

/** Fallback when there's no photo: a render of the page itself. */
export async function savePageRender(file: string, hash: string, page: number, dir: string): Promise<string | null> {
  const name = photoName(hash, { page });
  if (existsSync(path.join(dir, name))) return name;
  try {
    const base = path.join(dir, name.replace(/\.jpg$/, ""));
    await run("pdftoppm", ["-f", String(page), "-l", String(page), "-jpeg", "-scale-to", "800", "-singlefile", file, base]);
    return name;
  } catch {
    return null;
  }
}

async function isPhotoPage(file: string, page: number): Promise<boolean> {
  try {
    const { stdout } = await run("pdftotext", ["-f", String(page), "-l", String(page), file, "-"]);
    return stdout.replace(/\s+/g, "").length < 40;
  } catch {
    return false;
  }
}

/**
 * Best photo for a page range, falling back to rendering the first page. Returns a /files URL.
 * With `book` (pattern books, where neighbouring patterns share pages), a full-page photo just
 * before the title page wins (that's how Knotmonsters lays them out), then the title page.
 */
export async function coverFor(
  file: string,
  hash: string,
  range: PageRange,
  dir: string,
  opts: { book?: boolean } = {},
): Promise<string | null> {
  const all = await photoCandidates(file, range);
  const groups = [all];
  if (opts.book) {
    const before = range.first - 1;
    const hero =
      before >= 1 && (await isPhotoPage(file, before)) ? await photoCandidates(file, { first: before, last: before }) : [];
    groups.splice(
      0,
      1,
      hero,
      all.filter((c) => c.page === range.first),
      all.filter((c) => c.page !== range.first),
    );
  }
  const cache: PageCache = new Map();
  try {
    for (const group of groups) {
      // Cover pages layer decorations (frames, splashes, backgrounds) as mostly
      // transparent masked images. Real cut-out photos are mostly opaque, so
      // weigh each candidate by its opaque share and skip the see-through ones.
      let best: { name: string; score: number } | null = null;
      for (const c of group.slice(0, 6)) {
        const saved = await extractPhoto(file, hash, c, dir, cache);
        if (!saved || saved.coverage < 0.5) continue;
        const score = c.score * saved.coverage;
        if (!best || score > best.score) best = { name: saved.name, score };
      }
      if (best) return `/files/${best.name}`;
    }
  } finally {
    await cleanup(cache);
  }
  const name = await savePageRender(file, hash, range.first, dir);
  return name && `/files/${name}`;
}
